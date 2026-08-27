import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Droplets,
  Filter,
  Home,
  Layers,
  Plus,
  Target,
  Trash2,
  Trees,
  X,
} from 'lucide-react';
import { mergeBlokProfilleri } from '../data/blokMasterSeed';
import { PARSEL_LIST, blokListForParsel } from '../data/parselBlokMap';
import { db, removeDocument, saveDocument } from '../lib/firebase';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import {
  addDaysToDateKey,
  formatDateLabelTr,
  todayDateKey,
  tomorrowDateKey,
} from '../lib/dateKeyUtils';
import { buildBlokHaritaOzetleri, buildKaynakHavuzlari } from '../lib/projeBlokHaritaUtils';
import { mergeDisiplinIlerleme } from '../lib/projeDisiplinUtils';
import {
  buildMuhendislikOzet,
  buildMuhendislikWbs,
} from '../lib/projeMuhendislikUtils';
import { ProjeBlokHaritaPanel } from './ProjeBlokHaritaPanel';
import { ProjeCBlokPanel } from './ProjeCBlokPanel';
import { ProjeDisiplinPanel } from './ProjeDisiplinPanel';
import { ProjeMuhendislikPanel } from './ProjeMuhendislikPanel';
import {
  PROJE_ILERLEME_DURUM_LABEL,
  PROJE_ILERLEME_KOVALAR,
  PROJE_ILERLEME_KOVA_LABEL,
  PROJE_IS_PLAN_DURUMLAR,
  PROJE_IS_PLAN_DURUM_LABEL,
  calcKapanisYuzde,
  calcKovaYuzde,
  calcPlanIlerleme,
  kirmiziListe,
  newProjeIlerlemeId,
  newProjeIsPlanId,
  planSatirNot,
  punchDurumFromPlan,
  sortKalemler,
  sortPlanSatirlari,
} from '../lib/projeIlerlemeUtils';
import type {
  Personel,
  ProjeBlokProfili,
  ProjeCDaireKalem,
  ProjeDisiplinIlerleme,
  ProjeIlerlemeDurum,
  ProjeIlerlemeKalemi,
  ProjeIlerlemeKova,
  ProjeIsPlanDurum,
  ProjeIsPlanSatiri,
  SahaFaaliyeti,
  SahaIsPlani,
  SahaSiparis,
  TemizlikDaire,
} from '../types/erp';

const COLLECTION = 'projeIlerlemeKalemleri';
const PLAN_COLLECTION = 'projeIsPlanSatirlari';
const BLOK_PROFIL_COLLECTION = 'projeBlokProfilleri';
const DISIPLIN_COLLECTION = 'projeDisiplinIlerleme';
const C_DAIRE_KALEM_COLLECTION = 'projeCDaireKalemleri';
const PARSEL_SECENEK = PARSEL_LIST.filter((p) => p !== 'GENEL SAHA');
const MUHENDISLIK_GUN = 30;

type Props = {
  currentUser?: { email?: string; ad?: string; soyad?: string; displayName?: string } | null;
};

type Sekme = 'tespit' | 'program' | 'muhendislik' | 'harita' | 'altyapi' | 'peyzaj' | 'cblok';

type Draft = {
  parsel: string;
  blok: string;
  baslik: string;
  kova: ProjeIlerlemeKova;
  durum: ProjeIlerlemeDurum;
  agirlik: 1 | 2 | 3;
  kirmiziEngel: boolean;
  hedefTarih: string;
  sorumlu: string;
  engel: string;
  not: string;
};

function emptyDraft(parsel = PARSEL_SECENEK[0] || ''): Draft {
  const bloklar = blokListForParsel(parsel).filter((b) => b !== 'GENEL SAHA');
  return {
    parsel,
    blok: bloklar[0] || '',
    baslik: '',
    kova: 'EKSIK_IMALAT',
    durum: 'ACIK',
    agirlik: 2,
    kirmiziEngel: false,
    hedefTarih: '',
    sorumlu: '',
    engel: '',
    not: '',
  };
}

function userLabel(u: Props['currentUser']): string {
  if (!u) return '';
  const name = [u.ad, u.soyad].filter(Boolean).join(' ').trim();
  return name || u.displayName || u.email || '';
}

function durumTone(d: ProjeIlerlemeDurum): string {
  if (d === 'KAPANDI') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (d === 'DEVAM') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (d === 'BEKLEMEDE') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-rose-50 text-rose-800 border-rose-200';
}

function planDurumTone(d: ProjeIsPlanDurum): string {
  if (d === 'TAMAMLANDI') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (d === 'IMALATTA') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (d === 'ERTELENDI') return 'bg-orange-50 text-orange-900 border-orange-200';
  if (d === 'PROGRAMDAN_CIKARILDI') return 'bg-slate-100 text-slate-500 border-slate-200';
  return 'bg-sky-50 text-sky-900 border-sky-200';
}

export const ProjeIlerlemeScreen: React.FC<Props> = ({ currentUser }) => {
  const [kalemler, setKalemler] = useState<ProjeIlerlemeKalemi[]>([]);
  const [planSatirlari, setPlanSatirlari] = useState<ProjeIsPlanSatiri[]>([]);
  const [faaliyetler, setFaaliyetler] = useState<SahaFaaliyeti[]>([]);
  const [sahaIsPlanlari, setSahaIsPlanlari] = useState<SahaIsPlani[]>([]);
  const [siparisler, setSiparisler] = useState<SahaSiparis[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [temizlikDaireleri, setTemizlikDaireleri] = useState<TemizlikDaire[]>([]);
  const [blokProfilleri, setBlokProfilleri] = useState<ProjeBlokProfili[]>([]);
  const [disiplinKayitlari, setDisiplinKayitlari] = useState<ProjeDisiplinIlerleme[]>([]);
  const [cDaireKalemleri, setCDaireKalemleri] = useState<ProjeCDaireKalem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sekme, setSekme] = useState<Sekme>('tespit');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [filtreParsel, setFiltreParsel] = useState('');
  const [filtreKova, setFiltreKova] = useState<ProjeIlerlemeKova | ''>('');
  const [filtreDurum, setFiltreDurum] = useState<ProjeIlerlemeDurum | ''>('');
  const [sadeceAcik, setSadeceAcik] = useState(true);
  const [seciliKalemIds, setSeciliKalemIds] = useState<string[]>([]);
  const [programTarih, setProgramTarih] = useState(tomorrowDateKey());
  const [haritaParsel, setHaritaParsel] = useState(PARSEL_SECENEK[0] || '');
  const muhendislikBaslangic = addDaysToDateKey(todayDateKey(), -MUHENDISLIK_GUN);

  useEffect(() => {
    const unsubKalem = onSnapshot(
      collection(db, COLLECTION),
      (snap) => {
        const rows: ProjeIlerlemeKalemi[] = snap.docs.map((d) => {
          const data = d.data() as Omit<ProjeIlerlemeKalemi, 'id'>;
          return { ...data, id: d.id };
        });
        setKalemler(rows);
        setLoading(false);
      },
      (err) => {
        console.error('[proje-ilerleme] snapshot', err);
        setLoading(false);
      }
    );
    const unsubPlan = onSnapshot(
      collection(db, PLAN_COLLECTION),
      (snap) => {
        const rows: ProjeIsPlanSatiri[] = snap.docs.map((d) => {
          const data = d.data() as Omit<ProjeIsPlanSatiri, 'id'>;
          return { ...data, id: d.id };
        });
        setPlanSatirlari(rows);
      },
      (err) => console.error('[proje-is-programi] snapshot', err)
    );
    const unsubFaaliyet = onSnapshot(collection(db, 'sahaFaaliyetleri'), (snap) => {
      setFaaliyetler(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SahaFaaliyeti)));
    });
    const unsubIsPlan = onSnapshot(collection(db, 'sahaIsPlanlari'), (snap) => {
      setSahaIsPlanlari(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SahaIsPlani)));
    });
    const unsubSiparis = onSnapshot(collection(db, 'sahaSiparisleri'), (snap) => {
      setSiparisler(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SahaSiparis)));
    });
    const unsubPersonel = onSnapshot(collection(db, 'personeller'), (snap) => {
      setPersoneller(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Personel)));
    });
    const unsubDaire = onSnapshot(collection(db, 'temizlikDaireleri'), (snap) => {
      setTemizlikDaireleri(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TemizlikDaire)));
    });
    const unsubBlokProfil = onSnapshot(collection(db, BLOK_PROFIL_COLLECTION), (snap) => {
      setBlokProfilleri(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjeBlokProfili)));
    });
    const unsubDisiplin = onSnapshot(collection(db, DISIPLIN_COLLECTION), (snap) => {
      setDisiplinKayitlari(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjeDisiplinIlerleme))
      );
    });
    const unsubCDaire = onSnapshot(collection(db, C_DAIRE_KALEM_COLLECTION), (snap) => {
      setCDaireKalemleri(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjeCDaireKalem)));
    });
    return () => {
      unsubKalem();
      unsubPlan();
      unsubFaaliyet();
      unsubIsPlan();
      unsubSiparis();
      unsubPersonel();
      unsubDaire();
      unsubBlokProfil();
      unsubDisiplin();
      unsubCDaire();
    };
  }, []);

  const kapanisYuzde = useMemo(() => calcKapanisYuzde(kalemler), [kalemler]);
  const kirmizilar = useMemo(() => kirmiziListe(kalemler), [kalemler]);
  const kovaOzet = useMemo(
    () => PROJE_ILERLEME_KOVALAR.map((kova) => ({ kova, ...calcKovaYuzde(kalemler, kova) })),
    [kalemler]
  );

  const filtered = useMemo(() => {
    return kalemler
      .filter((k) => {
        if (filtreParsel && k.parsel !== filtreParsel) return false;
        if (filtreKova && k.kova !== filtreKova) return false;
        if (filtreDurum && k.durum !== filtreDurum) return false;
        if (sadeceAcik && k.durum === 'KAPANDI') return false;
        return true;
      })
      .slice()
      .sort(sortKalemler);
  }, [kalemler, filtreParsel, filtreKova, filtreDurum, sadeceAcik]);

  const gunlukProgram = useMemo(
    () =>
      planSatirlari
        .filter((s) => s.tarih === programTarih)
        .slice()
        .sort(sortPlanSatirlari),
    [planSatirlari, programTarih]
  );

  const programOzet = useMemo(() => calcPlanIlerleme(gunlukProgram), [gunlukProgram]);

  const mergedBlokProfilleri = useMemo(() => {
    const daireSay = new Map<string, number>();
    for (const d of temizlikDaireleri) {
      const id = `${d.parsel}|${d.blok}`;
      daireSay.set(id, (daireSay.get(id) || 0) + 1);
    }
    return mergeBlokProfilleri(blokProfilleri, daireSay);
  }, [blokProfilleri, temizlikDaireleri]);

  const muhendislikInput = useMemo(
    () => ({
      kalemler,
      planSatirlari,
      faaliyetler,
      sahaIsPlanlari,
      siparisler,
      parsel: filtreParsel || undefined,
      baslangicTarih: muhendislikBaslangic,
      bitisTarih: todayDateKey(),
    }),
    [
      kalemler,
      planSatirlari,
      faaliyetler,
      sahaIsPlanlari,
      siparisler,
      filtreParsel,
      muhendislikBaslangic,
    ]
  );

  const muhendislikOzet = useMemo(() => buildMuhendislikOzet(muhendislikInput), [muhendislikInput]);
  const muhendislikWbs = useMemo(() => buildMuhendislikWbs(muhendislikInput), [muhendislikInput]);
  const kaynakHavuzlari = useMemo(() => buildKaynakHavuzlari(personeller), [personeller]);

  const blokHaritaOzetleri = useMemo(
    () =>
      buildBlokHaritaOzetleri({
        profiller: mergedBlokProfilleri,
        kalemler,
        faaliyetler,
        temizlikDaireleri,
        parsel: haritaParsel,
      }),
    [mergedBlokProfilleri, kalemler, faaliyetler, temizlikDaireleri, haritaParsel]
  );

  const altyapiSatirlari = useMemo(
    () => mergeDisiplinIlerleme('ALTYAPI', disiplinKayitlari),
    [disiplinKayitlari]
  );
  const peyzajSatirlari = useMemo(
    () => mergeDisiplinIlerleme('PEYZAJ', disiplinKayitlari),
    [disiplinKayitlari]
  );
  const mimariSatirlari = useMemo(
    () => mergeDisiplinIlerleme('MIMARI', disiplinKayitlari),
    [disiplinKayitlari]
  );

  const updateDisiplin = async (
    row: ProjeDisiplinIlerleme,
    patch: Partial<ProjeDisiplinIlerleme>
  ) => {
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      const payload: ProjeDisiplinIlerleme = {
        ...row,
        ...patch,
        guncellemeTarihi: todayDateKey(),
        olusturan: row.olusturan || userLabel(currentUser) || undefined,
      };
      await saveDocument(DISIPLIN_COLLECTION, payload);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Disiplin ilerleme yazılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const updateCDaireKalem = async (row: ProjeCDaireKalem) => {
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      const payload: ProjeCDaireKalem = {
        ...row,
        guncellemeTarihi: todayDateKey(),
        olusturan: row.olusturan || userLabel(currentUser) || undefined,
      };
      await saveDocument(C_DAIRE_KALEM_COLLECTION, payload);
      setCDaireKalemleri((prev) => {
        const rest = prev.filter((x) => x.id !== payload.id);
        return [...rest, payload];
      });
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Daire kalemi yazılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const draftBloklar = useMemo(
    () => blokListForParsel(draft.parsel).filter((b) => b !== 'GENEL SAHA'),
    [draft.parsel]
  );

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft(filtreParsel || PARSEL_SECENEK[0] || ''));
    setModalOpen(true);
  };

  const openEdit = (k: ProjeIlerlemeKalemi) => {
    setEditingId(k.id);
    setDraft({
      parsel: k.parsel,
      blok: k.blok,
      baslik: k.baslik,
      kova: k.kova,
      durum: k.durum,
      agirlik: k.agirlik || 2,
      kirmiziEngel: Boolean(k.kirmiziEngel),
      hedefTarih: k.hedefTarih || '',
      sorumlu: k.sorumlu || '',
      engel: k.engel || '',
      not: k.not || '',
    });
    setModalOpen(true);
  };

  const persist = async () => {
    const baslik = draft.baslik.trim();
    if (!baslik) {
      alert('İş kalemi başlığı zorunlu.');
      return;
    }
    if (!draft.parsel || !draft.blok) {
      alert('Parsel ve blok seçin.');
      return;
    }
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      const now = todayDateKey();
      const id = editingId || newProjeIlerlemeId();
      const prev = editingId ? kalemler.find((k) => k.id === editingId) : undefined;
      const payload: ProjeIlerlemeKalemi = {
        id,
        parsel: draft.parsel,
        blok: draft.blok,
        baslik,
        kova: draft.kova,
        durum: draft.durum,
        agirlik: draft.agirlik,
        kirmiziEngel: draft.kirmiziEngel,
        hedefTarih: draft.hedefTarih || undefined,
        sorumlu: draft.sorumlu.trim() || undefined,
        engel: draft.engel.trim() || undefined,
        not: draft.not.trim() || undefined,
        olusturmaTarihi: prev?.olusturmaTarihi || now,
        guncellemeTarihi: now,
        olusturan: prev?.olusturan || userLabel(currentUser) || undefined,
      };
      await saveDocument(COLLECTION, payload);
      setModalOpen(false);
      setEditingId(null);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Kayıt yazılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const markKapandi = async (k: ProjeIlerlemeKalemi) => {
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      await saveDocument(COLLECTION, {
        ...k,
        durum: 'KAPANDI',
        guncellemeTarihi: todayDateKey(),
      } as ProjeIlerlemeKalemi);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const removeKalem = async (k: ProjeIlerlemeKalemi) => {
    if (!confirm(`«${k.baslik}» tespitten silinsin mi?`)) return;
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      await removeDocument(COLLECTION, k.id);
      setSeciliKalemIds((prev) => prev.filter((id) => id !== k.id));
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Silinemedi.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSecim = (id: string) => {
    setSeciliKalemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const programaAl = async () => {
    const secilenler = kalemler.filter((k) => seciliKalemIds.includes(k.id) && k.durum !== 'KAPANDI');
    if (!secilenler.length) {
      alert('Programa alınacak açık iş kalemi seçin.');
      return;
    }
    if (!programTarih) {
      alert('Program günü seçin.');
      return;
    }
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      const mevcut = new Set(
        planSatirlari.filter((s) => s.tarih === programTarih).map((s) => s.kalemId)
      );
      const now = todayDateKey();
      let sira =
        Math.max(0, ...planSatirlari.filter((s) => s.tarih === programTarih).map((s) => s.sira || 0)) +
        1;
      let eklendi = 0;
      for (const k of secilenler) {
        if (mevcut.has(k.id)) continue;
        const payload: ProjeIsPlanSatiri = {
          id: newProjeIsPlanId(),
          tarih: programTarih,
          kalemId: k.id,
          parsel: k.parsel,
          blok: k.blok,
          baslik: k.baslik,
          kova: k.kova,
          agirlik: k.agirlik || 2,
          kirmiziEngel: Boolean(k.kirmiziEngel),
          durum: 'PROGRAMDA',
          sira: sira++,
          olusturmaTarihi: now,
          guncellemeTarihi: now,
          olusturan: userLabel(currentUser) || undefined,
        };
        await saveDocument(PLAN_COLLECTION, payload);
        eklendi += 1;
      }
      setSeciliKalemIds([]);
      setSekme('program');
      if (!eklendi) {
        alert('Seçilen kalemler bu program gününde zaten var.');
      }
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Programa alınamadı.');
    } finally {
      setSaving(false);
    }
  };

  const setPlanDurum = async (satir: ProjeIsPlanSatiri, durum: ProjeIsPlanDurum) => {
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      const now = todayDateKey();
      await saveDocument(PLAN_COLLECTION, {
        ...satir,
        durum,
        guncellemeTarihi: now,
      } as ProjeIsPlanSatiri);

      const punchDurum = punchDurumFromPlan(durum);
      const kalem = kalemler.find((k) => k.id === satir.kalemId);
      if (punchDurum && kalem) {
        await saveDocument(COLLECTION, {
          ...kalem,
          durum: punchDurum,
          guncellemeTarihi: now,
        } as ProjeIlerlemeKalemi);
      }
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Gerçekleşme güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const setPlanNot = async (satir: ProjeIsPlanSatiri, not: string) => {
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      await saveDocument(PLAN_COLLECTION, {
        ...satir,
        gerceklesmeNot: not.trim() || undefined,
        guncellemeTarihi: todayDateKey(),
      } as ProjeIsPlanSatiri);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Not yazılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const removePlanSatir = async (satir: ProjeIsPlanSatiri) => {
    if (!confirm(`«${satir.baslik}» günlük iş programından çıkarılsın mı?`)) return;
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      await removeDocument(PLAN_COLLECTION, satir.id);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Çıkarılamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-50 via-white to-amber-50/40 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800/80">
              Kapanış · Punch · Altyapı · Peyzaj · Blok haritası
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">Proje İlerlemesi</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              157/51 DWG’den altyapı, peyzaj ve C blok daire planı; animasyonlu saha; tespit → program →
              plan–fiili →
              blok haritası. Slider ile yüzde güncelleyin, sahne canlı dolsun.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-center shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Kapanış</div>
              <div className="text-3xl font-black tabular-nums text-stone-900">{kapanisYuzde}%</div>
              <div className="text-[10px] text-stone-500">
                {kalemler.filter((k) => k.durum === 'KAPANDI').length}/{kalemler.length} kalem
              </div>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-stone-800"
            >
              <Plus size={16} /> Yeni tespit
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {kovaOzet.map(({ kova, yuzde, acik, toplam }) => (
            <button
              key={kova}
              type="button"
              onClick={() => setFiltreKova((prev) => (prev === kova ? '' : kova))}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                filtreKova === kova
                  ? 'border-amber-400 bg-amber-50 shadow-sm'
                  : 'border-stone-200 bg-white/80 hover:border-stone-300'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                {PROJE_ILERLEME_KOVA_LABEL[kova]}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-black tabular-nums text-stone-900">{toplam ? yuzde : 0}%</span>
                <span className="text-[10px] font-semibold text-stone-500">
                  {acik} açık / {toplam}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${toplam ? yuzde : 0}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {kirmizilar.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
          <div className="mb-2 flex items-center gap-2 text-rose-900">
            <AlertTriangle size={16} />
            <span className="text-xs font-black uppercase tracking-wide">
              Kırmızı liste — teslimi bloke ({kirmizilar.length})
            </span>
          </div>
          <ul className="space-y-1.5">
            {kirmizilar.slice(0, 12).map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 text-sm text-rose-950">
                <span className="font-bold">
                  {k.parsel.replace('Parsel Bölge ', '')} · {k.blok}
                </span>
                <span className="text-rose-800/80">—</span>
                <button
                  type="button"
                  onClick={() => openEdit(k)}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {k.baslik}
                </button>
                {k.engel && <span className="text-xs text-rose-700">({k.engel})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSekme('tespit')}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide cursor-pointer ${
            sekme === 'tespit'
              ? 'border-stone-900 bg-stone-900 text-white'
              : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          <ClipboardList size={14} /> Tespit / Punch listesi
        </button>
        <button
          type="button"
          onClick={() => setSekme('program')}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide cursor-pointer ${
            sekme === 'program'
              ? 'border-amber-700 bg-amber-700 text-white'
              : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          <CalendarDays size={14} /> Günlük iş programı
          {programOzet.toplam > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] tabular-nums">
              {programOzet.tamamlanan}/{programOzet.toplam}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSekme('muhendislik')}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide cursor-pointer ${
            sekme === 'muhendislik'
              ? 'border-sky-700 bg-sky-700 text-white'
              : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          <Layers size={14} /> WBS / Plan–fiili
        </button>
        <button
          type="button"
          onClick={() => setSekme('harita')}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide cursor-pointer ${
            sekme === 'harita'
              ? 'border-emerald-700 bg-emerald-700 text-white'
              : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          <Building2 size={14} /> Blok haritası
        </button>
        <button
          type="button"
          onClick={() => setSekme('altyapi')}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide cursor-pointer ${
            sekme === 'altyapi'
              ? 'border-sky-600 bg-sky-600 text-white'
              : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          <Droplets size={14} /> Altyapı 157/51
        </button>
        <button
          type="button"
          onClick={() => setSekme('peyzaj')}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide cursor-pointer ${
            sekme === 'peyzaj'
              ? 'border-green-700 bg-green-700 text-white'
              : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          <Trees size={14} /> Peyzaj 157/51
        </button>
        <button
          type="button"
          onClick={() => setSekme('cblok')}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide cursor-pointer ${
            sekme === 'cblok'
              ? 'border-violet-700 bg-violet-700 text-white'
              : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          <Home size={14} /> C Bloklar 157/51
        </button>
      </div>

      {sekme === 'muhendislik' ? (
        <ProjeMuhendislikPanel
          ozet={muhendislikOzet}
          wbs={muhendislikWbs}
          baslangicTarih={muhendislikBaslangic}
          bitisTarih={todayDateKey()}
          faaliyetler={faaliyetler}
          parsel={filtreParsel || undefined}
        />
      ) : sekme === 'harita' ? (
        <ProjeBlokHaritaPanel
          parsel={haritaParsel}
          parselSecenek={PARSEL_SECENEK}
          blokOzetleri={blokHaritaOzetleri}
          kaynakHavuzlari={kaynakHavuzlari}
          onParselChange={setHaritaParsel}
        />
      ) : sekme === 'altyapi' ? (
        <ProjeDisiplinPanel
          grup="ALTYAPI"
          satirlari={altyapiSatirlari}
          busy={saving}
          onUpdate={(row, patch) => void updateDisiplin(row, patch)}
        />
      ) : sekme === 'peyzaj' ? (
        <ProjeDisiplinPanel
          grup="PEYZAJ"
          satirlari={peyzajSatirlari}
          busy={saving}
          onUpdate={(row, patch) => void updateDisiplin(row, patch)}
        />
      ) : sekme === 'cblok' ? (
        <ProjeCBlokPanel
          satirlari={mimariSatirlari}
          daireKalemleri={cDaireKalemleri}
          busy={saving}
          onUpdateBlok={(row, patch) => void updateDisiplin(row, patch)}
          onUpdateDaireKalem={(row) => void updateCDaireKalem(row)}
        />
      ) : sekme === 'tespit' ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
            <Filter size={14} className="text-stone-400" />
            <select
              value={filtreParsel}
              onChange={(e) => setFiltreParsel(e.target.value)}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold"
            >
              <option value="">Tüm parseller</option>
              {PARSEL_SECENEK.map((p) => (
                <option key={p} value={p}>
                  {p.replace('Parsel Bölge ', '')}
                </option>
              ))}
            </select>
            <select
              value={filtreKova}
              onChange={(e) => setFiltreKova(e.target.value as ProjeIlerlemeKova | '')}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold"
            >
              <option value="">Tüm kovalar</option>
              {PROJE_ILERLEME_KOVALAR.map((k) => (
                <option key={k} value={k}>
                  {PROJE_ILERLEME_KOVA_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              value={filtreDurum}
              onChange={(e) => setFiltreDurum(e.target.value as ProjeIlerlemeDurum | '')}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold"
            >
              <option value="">Tüm durumlar</option>
              {(Object.keys(PROJE_ILERLEME_DURUM_LABEL) as ProjeIlerlemeDurum[]).map((d) => (
                <option key={d} value={d}>
                  {PROJE_ILERLEME_DURUM_LABEL[d]}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-stone-600">
              <input
                type="checkbox"
                checked={sadeceAcik}
                onChange={(e) => setSadeceAcik(e.target.checked)}
                className="rounded border-stone-300"
              />
              Sadece açıklar
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-stone-500">
                Program günü
                <input
                  type="date"
                  value={programTarih}
                  onChange={(e) => setProgramTarih(e.target.value)}
                  className="ml-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold"
                />
              </label>
              <button
                type="button"
                disabled={saving || !seciliKalemIds.length}
                onClick={() => void programaAl()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50 cursor-pointer"
              >
                <CalendarDays size={12} /> Seçilenleri programa al ({seciliKalemIds.length})
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-10 text-center text-sm text-stone-500">Yükleniyor…</div>
            ) : filtered.length === 0 ? (
              <div className="space-y-3 p-10 text-center">
                <Target className="mx-auto text-stone-300" size={36} />
                <p className="text-sm font-semibold text-stone-700">Henüz açık iş kalemi yok</p>
                <p className="mx-auto max-w-md text-xs text-stone-500">
                  Sahada gördüğünüz eksik imalat / tadilat / peyzaj / evrak maddelerini «Yeni tespit»
                  ile punch listesine yazın; sonra günlük iş programına alın.
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white"
                >
                  <Plus size={14} /> İlk tespiti ekle
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-stone-100 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-3 py-2.5 w-8" />
                      <th className="px-3 py-2.5">Yer</th>
                      <th className="px-3 py-2.5">İş kalemi</th>
                      <th className="px-3 py-2.5">Kova</th>
                      <th className="px-3 py-2.5">Durum</th>
                      <th className="px-3 py-2.5 text-center">Ağırlık</th>
                      <th className="px-3 py-2.5">Hedef</th>
                      <th className="px-3 py-2.5">Sorumlu / Engel</th>
                      <th className="px-3 py-2.5 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((k) => (
                      <tr
                        key={k.id}
                        className={`border-t border-stone-100 hover:bg-stone-50/80 ${
                          k.kirmiziEngel && k.durum !== 'KAPANDI' ? 'bg-rose-50/40' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          {k.durum !== 'KAPANDI' && (
                            <input
                              type="checkbox"
                              checked={seciliKalemIds.includes(k.id)}
                              onChange={() => toggleSecim(k.id)}
                              className="rounded border-stone-300"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-stone-800 whitespace-nowrap">
                          {String(k.parsel || '').replace('Parsel Bölge ', '')}
                          <span className="text-stone-400"> · </span>
                          {k.blok}
                          {k.kirmiziEngel && k.durum !== 'KAPANDI' && (
                            <span className="ml-1 inline-flex rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-800">
                              KRİTİK
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => openEdit(k)}
                            className="font-semibold text-stone-900 hover:underline"
                          >
                            {k.baslik}
                          </button>
                          {k.not && (
                            <div className="mt-0.5 text-[10px] text-stone-500 line-clamp-1">{k.not}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-stone-700">{PROJE_ILERLEME_KOVA_LABEL[k.kova]}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${durumTone(k.durum)}`}
                          >
                            {PROJE_ILERLEME_DURUM_LABEL[k.durum]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-stone-700">
                          {k.agirlik}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-stone-600">{k.hedefTarih || '—'}</td>
                        <td className="px-3 py-2.5 text-stone-600">
                          <div>{k.sorumlu || '—'}</div>
                          {k.engel && <div className="text-[10px] text-rose-700">{k.engel}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            {k.durum !== 'KAPANDI' && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void markKapandi(k)}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-800 hover:bg-emerald-100"
                                title="Kabul / kapandı"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void removeKalem(k)}
                              className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
                              title="Sil"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-900/70">
                  Saha · Günlük iş programı · Gerçekleşme
                </p>
                <h2 className="text-lg font-black text-stone-900">
                  {formatDateLabelTr(programTarih)} programı
                </h2>
                <p className="mt-1 text-xs text-stone-600 max-w-xl">
                  Tespitten alınan kalemlerin o günkü imalat sırası. Durum güncellemesi punch
                  listesine de yansır (imalatta → uygulamada, tamamlandı → kabul).
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-[10px] font-bold uppercase text-stone-500">
                  Program günü
                  <input
                    type="date"
                    value={programTarih}
                    onChange={(e) => setProgramTarih(e.target.value)}
                    className="mt-1 block rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-semibold"
                  />
                </label>
                <div className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-center">
                  <div className="text-[10px] font-bold uppercase text-stone-500">Gerçekleşme</div>
                  <div className="text-2xl font-black tabular-nums text-stone-900">
                    {programOzet.yuzde}%
                  </div>
                  <div className="text-[10px] text-stone-500">
                    {programOzet.tamamlanan} tamam · {programOzet.imalatta} imalatta ·{' '}
                    {programOzet.programda} programda
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-amber-600 transition-all"
                style={{ width: `${programOzet.yuzde}%` }}
              />
            </div>
          </div>

          {!gunlukProgram.length ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
              <CalendarDays className="mx-auto text-stone-300" size={36} />
              <p className="mt-3 text-sm font-semibold text-stone-700">
                Bu güne ait iş programı boş
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-stone-500">
                Tespit sekmesinden açık kalemleri seçip «Seçilenleri programa al» ile günlük iş
                programına dökün.
              </p>
              <button
                type="button"
                onClick={() => setSekme('tespit')}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white"
              >
                <ClipboardList size={14} /> Tespit listesine git
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {gunlukProgram.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    s.kirmiziEngel && s.durum !== 'TAMAMLANDI'
                      ? 'border-rose-200'
                      : 'border-stone-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-stone-400">
                          #{s.sira}
                        </span>
                        <span className="text-xs font-bold text-stone-700">
                          {String(s.parsel || '').replace('Parsel Bölge ', '')} · {s.blok}
                        </span>
                        <span className="text-[10px] font-semibold text-stone-500">
                          {PROJE_ILERLEME_KOVA_LABEL[s.kova]}
                        </span>
                        {s.kirmiziEngel && s.durum !== 'TAMAMLANDI' && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-800">
                            TESLİM BLOKE
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-black text-stone-900">{s.baslik}</p>
                      <span
                        className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${planDurumTone(s.durum)}`}
                      >
                        {PROJE_IS_PLAN_DURUM_LABEL[s.durum]}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void removePlanSatir(s)}
                      className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
                      title="Programdan çıkar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {PROJE_IS_PLAN_DURUMLAR.filter((d) => d !== 'PROGRAMDAN_CIKARILDI').map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={saving || s.durum === d}
                        onClick={() => void setPlanDurum(s, d)}
                        className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black cursor-pointer disabled:opacity-40 ${
                          s.durum === d
                            ? planDurumTone(d)
                            : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        {PROJE_IS_PLAN_DURUM_LABEL[d]}
                      </button>
                    ))}
                  </div>

                  <label className="mt-3 block text-[10px] font-bold uppercase text-stone-500">
                    Gerçekleşme notu (engel / ekip / ölçü)
                    <input
                      defaultValue={planSatirNot(s)}
                      key={`${s.id}_${s.guncellemeTarihi || ''}`}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== planSatirNot(s)) void setPlanNot(s, next);
                      }}
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold"
                      placeholder="Örn. seramik ekibi bekleniyor · malzeme eksik · ölçü onayı"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-3 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-stone-100 bg-white px-4 py-3">
              <h2 className="text-sm font-black text-stone-900">
                {editingId ? 'Tespit kalemini düzenle' : 'Yeni tespit (açık iş kalemi)'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Parsel</label>
                  <select
                    value={draft.parsel}
                    onChange={(e) => {
                      const parsel = e.target.value;
                      const bloklar = blokListForParsel(parsel).filter((b) => b !== 'GENEL SAHA');
                      setDraft((d) => ({ ...d, parsel, blok: bloklar[0] || '' }));
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {PARSEL_SECENEK.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Blok</label>
                  <select
                    value={draft.blok}
                    onChange={(e) => setDraft((d) => ({ ...d, blok: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {draftBloklar.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">İş kalemi *</label>
                <input
                  value={draft.baslik}
                  onChange={(e) => setDraft((d) => ({ ...d, baslik: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold"
                  placeholder="Örn. C2 cephe boya tadilat / A1 peyzaj sulama"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Kova</label>
                  <select
                    value={draft.kova}
                    onChange={(e) => setDraft((d) => ({ ...d, kova: e.target.value as ProjeIlerlemeKova }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {PROJE_ILERLEME_KOVALAR.map((k) => (
                      <option key={k} value={k}>
                        {PROJE_ILERLEME_KOVA_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Durum</label>
                  <select
                    value={draft.durum}
                    onChange={(e) => setDraft((d) => ({ ...d, durum: e.target.value as ProjeIlerlemeDurum }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {(Object.keys(PROJE_ILERLEME_DURUM_LABEL) as ProjeIlerlemeDurum[]).map((d) => (
                      <option key={d} value={d}>
                        {PROJE_ILERLEME_DURUM_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Ağırlık (1–3)</label>
                  <select
                    value={draft.agirlik}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, agirlik: Number(e.target.value) as 1 | 2 | 3 }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    <option value={1}>1 — kolay</option>
                    <option value={2}>2 — normal</option>
                    <option value={3}>3 — kritik</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Hedef tarih</label>
                  <input
                    type="date"
                    value={draft.hedefTarih}
                    onChange={(e) => setDraft((d) => ({ ...d, hedefTarih: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs font-bold text-rose-900">
                <input
                  type="checkbox"
                  checked={draft.kirmiziEngel}
                  onChange={(e) => setDraft((d) => ({ ...d, kirmiziEngel: e.target.checked }))}
                />
                Teslimi / iskanı bloke eden kırmızı madde
              </label>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">
                  Sorumlu (mühendis / taşeron / ekip)
                </label>
                <input
                  value={draft.sorumlu}
                  onChange={(e) => setDraft((d) => ({ ...d, sorumlu: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">
                  Engel (malzeme / karar / işçilik / onay)
                </label>
                <input
                  value={draft.engel}
                  onChange={(e) => setDraft((d) => ({ ...d, engel: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">Saha notu</label>
                <textarea
                  value={draft.not}
                  onChange={(e) => setDraft((d) => ({ ...d, not: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-stone-100 bg-white p-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-xs font-bold text-stone-700"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist()}
                className="flex-1 rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjeIlerlemeScreen;
