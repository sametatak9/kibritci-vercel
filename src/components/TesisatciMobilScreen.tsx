import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Wrench, ClipboardList, Truck, Camera, CheckCircle, RefreshCw, X, AlertTriangle,
  LogOut, Pencil, Trash2, Calendar, Gauge, Printer
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  AylikYoklamaMap, CariKart, CariKartIslem, Fatura, KampYerleske, Personel, SahaFaaliyeti, TesisatciFaaliyet
} from '../types/erp';
import { db, cleanUndefined } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey, formatDateLabelTr, normalizeDateKey } from '../lib/dateKeyUtils';
import { applySahaMesaiToYoklama, normalizeMesaiHours } from '../lib/sahaFaaliyetUtils';
import { ensureSahaFaaliyetFotolarPersisted } from '../lib/sahaFaaliyetFotoStorage';
import { isTesisatciGorev } from '../lib/yoklamaUtils';
import { vibrateYildirimAlert } from '../lib/yildirimTankerUtils';
import {
  buildMobilGunlukFaaliyetReportHtml,
  openMobilGunlukFaaliyetReport,
} from '../lib/mobilGunlukFaaliyetReport';
import { KampGunlukYoklamaTab } from './KampGunlukYoklamaTab';
import { TesisatciYildirimTab } from './TesisatciYildirimTab';
import { TesisatciSayacKesintiTab } from './TesisatciSayacKesintiTab';

interface TesisatciMobilScreenProps {
  personeller: Personel[];
  yoklamalar?: AylikYoklamaMap;
  setYoklamalar?: (updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)) => void;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  cariKartlar?: CariKart[];
  faturalar?: Fatura[];
  kampYerleskeleri?: KampYerleske[];
  setCariKartlar?: (updater: CariKart[] | ((prev: CariKart[]) => CariKart[])) => void;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  currentUser: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
}

const IS_NITELIGI_OPTIONS = [
  'Tesisat Bakım / Onarım',
  'Su Tesisatı',
  'Atık Su / Vidanjör Destek',
  'Ofis Tesisat',
  'Kamp Tesisat',
  'Arıza Müdahale',
  'Diğer',
];

export const TesisatciMobilScreen: React.FC<TesisatciMobilScreenProps> = ({
  personeller,
  yoklamalar = {},
  setYoklamalar,
  saveYoklamalarNow,
  cariKartlar = [],
  faturalar = [],
  kampYerleskeleri = [],
  setCariKartlar,
  setCariIslemGecmisi,
  currentUser,
  onSignOut,
  isStandalone = false,
  addNotification,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'faaliyet' | 'yoklama' | 'yildirim' | 'sayac'>('faaliyet');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const statusHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = (type: 'success' | 'error' | 'info', text: string, autoHideMs = 4000) => {
    if (statusHideTimer.current) clearTimeout(statusHideTimer.current);
    setStatusMessage({ type, text });
    if (type !== 'info' && autoHideMs > 0) {
      statusHideTimer.current = setTimeout(() => setStatusMessage(null), autoHideMs);
    }
  };

  // ─── Yıldırım Tanker kapı bildirimi ───────────────────────────
  const [yildirimAlert, setYildirimAlert] = useState<string | null>(null);
  const seenNotifIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bildirimler'), (snap) => {
      const now = Date.now();
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const id = change.doc.id;
        if (seenNotifIds.current.has(id)) return;
        const data = change.doc.data() as Record<string, unknown>;
        const tip = String(data.tip || '');
        const hedef = String(data.hedefRol || '').toLocaleUpperCase('tr-TR');
        const mesaj = String(data.mesaj || '');
        const ts = new Date(String(data.tarih || 0)).getTime();
        if (Number.isFinite(ts) && now - ts > 120_000) return;
        const isYildirim =
          tip === 'YILDIRIM_TANKER_GIRIS' ||
          tip === 'SU_TANKERI_GIRIS' ||
          (hedef.includes('TESISAT') && mesaj.toLocaleLowerCase('tr-TR').includes('tanker'));
        if (!isYildirim) return;
        seenNotifIds.current.add(id);
        vibrateYildirimAlert();
        setYildirimAlert(mesaj || 'Yıldırım Tanker sahaya girdi — fiş yükleyin.');
        setActiveSubTab('yildirim');
        try {
          window.dispatchEvent(
            new CustomEvent('app-toast', {
              detail: { type: 'info', message: mesaj || 'Yıldırım Tanker girişi' },
            })
          );
        } catch {
          /* ignore */
        }
      });
    });
    return () => unsub();
  }, []);

  // ─── Faaliyet state ───────────────────────────────────────────
  const [faaliyetGrubu, setFaaliyetGrubu] = useState<'NORMAL' | 'MESAI'>('NORMAL');
  const [isNiteligi, setIsNiteligi] = useState(IS_NITELIGI_OPTIONS[0]);
  const [calismaAlani, setCalismaAlani] = useState<'KAMP' | 'OFİS'>('KAMP');
  const [yerleskeAdi, setYerleskeAdi] = useState('');
  const [faaliyetTarih, setFaaliyetTarih] = useState(todayDateKey());
  const [aciklama, setAciklama] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [personelMesaiSaatleri, setPersonelMesaiSaatleri] = useState<Record<string, number>>({});
  const [savingFaaliyet, setSavingFaaliyet] = useState(false);
  const [faaliyetler, setFaaliyetler] = useState<TesisatciFaaliyet[]>([]);
  const [editingFaaliyetId, setEditingFaaliyetId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tesisatciFaaliyetleri'), (snap) => {
      const list: TesisatciFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TesisatciFaaliyet, 'id'>) }));
      list.sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
      setFaaliyetler(list);
    });
    return () => unsub();
  }, []);

  const tesisatciPersoneller = useMemo(
    () => personeller.filter((p) => isTesisatciGorev(p.gorev)),
    [personeller]
  );

  const gunlukFaaliyetler = useMemo(
    () => faaliyetler.filter((f) => normalizeDateKey(f.tarih) === normalizeDateKey(faaliyetTarih)),
    [faaliyetler, faaliyetTarih]
  );

  const handleTopluRaporla = () => {
    if (gunlukFaaliyetler.length === 0) {
      showStatus('error', 'Bu tarihte birleştirilecek faaliyet kaydı yok.');
      return;
    }
    const html = buildMobilGunlukFaaliyetReportHtml({
      rol: 'TESİSATÇI',
      anchorDate: faaliyetTarih,
      records: gunlukFaaliyetler,
      olusturan: currentUser?.email || 'Tesisatçı',
    });
    openMobilGunlukFaaliyetReport(
      html,
      `Tesisatçı Günlük Rapor — ${formatDateLabelTr(faaliyetTarih)}`
    );
  };

  const handleFaaliyetFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      const raw = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setFotoUrl(await compressImage(raw, 1280, 1280, 0.75));
    } catch {
      showStatus('error', 'Fotoğraf yüklenemedi.');
    }
    e.target.value = '';
  };

  const resetFaaliyetForm = () => {
    setFaaliyetGrubu('NORMAL');
    setIsNiteligi(IS_NITELIGI_OPTIONS[0]);
    setCalismaAlani('KAMP');
    setYerleskeAdi('');
    setAciklama('');
    setFotoUrl('');
    setPersonelMesaiSaatleri({});
    setEditingFaaliyetId(null);
  };

  const syncMesai = async (
    tarih: string,
    nextMap?: Record<string, number>,
    prevMap?: Record<string, number>
  ) => {
    if (!setYoklamalar || !saveYoklamalarNow) return;
    const gonderen = currentUser?.email || 'TESISATCI_MOBIL';
    let draft = yoklamalar;
    if (prevMap && Object.keys(prevMap).length) {
      draft = applySahaMesaiToYoklama(draft, tarih, prevMap, gonderen, 'subtract');
    }
    if (nextMap && Object.keys(nextMap).length) {
      draft = applySahaMesaiToYoklama(draft, tarih, nextMap, gonderen, 'add');
    }
    setYoklamalar(draft);
    await saveYoklamalarNow(draft);
  };

  const handleSaveFaaliyet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aciklama.trim()) {
      showStatus('error', 'Açıklama zorunlu.');
      return;
    }
    if (calismaAlani === 'KAMP' && !yerleskeAdi.trim() && kampYerleskeleri.length > 0) {
      showStatus('error', 'Kamp alanı için yerleşke seçin.');
      return;
    }
    if (faaliyetGrubu === 'MESAI') {
      const hasMesai = Object.values(personelMesaiSaatleri).some((h) => Number(h) > 0);
      if (!hasMesai) {
        showStatus('error', 'Mesai faaliyeti için en az bir personele saat girin.');
        return;
      }
    }

    setSavingFaaliyet(true);
    try {
      const id = editingFaaliyetId || `tf_${Date.now()}`;
      const existing = editingFaaliyetId
        ? faaliyetler.find((f) => f.id === editingFaaliyetId)
        : null;
      const mesaiMap =
        faaliyetGrubu === 'MESAI'
          ? Object.fromEntries(
              Object.entries(personelMesaiSaatleri)
                .map(([pid, h]) => [pid, normalizeMesaiHours(Number(h))])
                .filter(([, h]) => Number(h) > 0)
            )
          : null;

      const kaydedenEmail = String(currentUser?.email || 'tesisatci').trim().toLowerCase();
      let aktifPersonelListesi: string[] = [];
      if (mesaiMap && Object.keys(mesaiMap).length > 0) {
        aktifPersonelListesi = Object.keys(mesaiMap);
      } else {
        const self = tesisatciPersoneller.find(
          (p) => String(p.eposta || '').trim().toLowerCase() === kaydedenEmail
        );
        if (self?.id) aktifPersonelListesi = [self.id];
        else if (existing?.aktifPersonelListesi?.length) {
          aktifPersonelListesi = [...existing.aktifPersonelListesi];
        } else if (tesisatciPersoneller.length === 1) {
          aktifPersonelListesi = [tesisatciPersoneller[0].id];
        }
      }

      const fotoSeed = fotoUrl || existing?.fotoUrl || '';
      let fotoPayload: { fotoUrl?: string | null; fotoUrls?: string[] } = {
        fotoUrl: fotoSeed || null,
        fotoUrls: fotoSeed ? [fotoSeed] : [],
      };
      try {
        const persisted = await ensureSahaFaaliyetFotolarPersisted({
          id,
          fotoUrl: fotoPayload.fotoUrl || undefined,
          fotoUrls: fotoPayload.fotoUrls,
        } as SahaFaaliyeti);
        fotoPayload = {
          fotoUrl: persisted.fotoUrl || null,
          fotoUrls: persisted.fotoUrls || (persisted.fotoUrl ? [persisted.fotoUrl] : []),
        };
      } catch (fotoErr) {
        console.warn('Tesisatçı foto Storage atlandı:', fotoErr);
      }

      const payload: Record<string, unknown> = {
        id,
        tarih: normalizeDateKey(faaliyetTarih),
        faaliyetGrubu,
        isNiteligi,
        calismaAlani,
        yerleskeAdi: calismaAlani === 'OFİS' ? 'Ofis' : yerleskeAdi.trim() || 'Kamp',
        aciklama: aciklama.trim(),
        fotoUrl: fotoPayload.fotoUrl,
        fotoUrls: fotoPayload.fotoUrls?.length ? fotoPayload.fotoUrls : [],
        aktifPersonelListesi,
        durum: 'ONAY BEKLİYOR',
        kaydeden: currentUser?.email || 'tesisatci',
        kaynakEkran: 'TESISATCI_MOBIL',
        olusturulma: existing?.olusturulma || new Date().toISOString(),
        guncellenme: new Date().toISOString(),
      };
      // Firestore undefined kabul etmez — mesai yoksa alanı yazma / null
      if (mesaiMap && Object.keys(mesaiMap).length > 0) {
        payload.personelMesaiSaatleri = mesaiMap;
      } else {
        payload.personelMesaiSaatleri = null;
      }

      await setDoc(doc(db, 'tesisatciFaaliyetleri', id), cleanUndefined(payload));

      if (faaliyetGrubu === 'MESAI' || existing?.faaliyetGrubu === 'MESAI') {
        await syncMesai(
          String(payload.tarih),
          faaliyetGrubu === 'MESAI' && mesaiMap ? mesaiMap : undefined,
          existing?.faaliyetGrubu === 'MESAI' ? existing.personelMesaiSaatleri : undefined
        );
      }

      if (addNotification) {
        await addNotification(
          `Tesisatçı ${faaliyetGrubu === 'MESAI' ? 'mesai ' : ''}faaliyeti: ${isNiteligi} (${payload.calismaAlani}${payload.yerleskeAdi ? ' / ' + payload.yerleskeAdi : ''})`
        );
      }
      showStatus('success', editingFaaliyetId ? 'Faaliyet güncellendi.' : 'Faaliyet kaydedildi.');
      resetFaaliyetForm();
    } catch (err: any) {
      console.error(err);
      showStatus('error', 'Kayıt başarısız: ' + (err?.message || ''));
    } finally {
      setSavingFaaliyet(false);
    }
  };

  const handleEditFaaliyet = (f: TesisatciFaaliyet) => {
    setEditingFaaliyetId(f.id);
    setFaaliyetTarih(normalizeDateKey(f.tarih));
    setFaaliyetGrubu(f.faaliyetGrubu || 'NORMAL');
    setIsNiteligi(f.isNiteligi || IS_NITELIGI_OPTIONS[0]);
    setCalismaAlani(f.calismaAlani || 'KAMP');
    setYerleskeAdi(f.yerleskeAdi || '');
    setAciklama(f.aciklama || '');
    setFotoUrl(f.fotoUrl || '');
    setPersonelMesaiSaatleri(f.personelMesaiSaatleri || {});
  };

  const handleSilFaaliyet = async (f: TesisatciFaaliyet) => {
    if (!window.confirm('Bu faaliyet silinsin mi?')) return;
    try {
      await deleteDoc(doc(db, 'tesisatciFaaliyetleri', f.id));
      if (f.faaliyetGrubu === 'MESAI' && f.personelMesaiSaatleri) {
        await syncMesai(f.tarih, undefined, f.personelMesaiSaatleri);
      }
      if (editingFaaliyetId === f.id) resetFaaliyetForm();
      showStatus('success', 'Faaliyet silindi.');
    } catch (err: any) {
      showStatus('error', 'Silinemedi: ' + (err?.message || ''));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-100 rounded-2xl">
            <Wrench className="text-sky-700" size={22} />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-wide">Tesisatçı Mobil</h1>
            <p className="text-[10px] text-slate-500">Kamp–Ofis faaliyet · Yoklama · Yıldırım Tanker</p>
          </div>
        </div>
        {isStandalone && onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl cursor-pointer"
            title="Çıkış"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2 max-w-xl ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : statusMessage.type === 'info'
                ? 'bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {statusMessage.type === 'info' ? (
            <RefreshCw size={14} className="animate-spin shrink-0" />
          ) : (
            <CheckCircle size={14} className="shrink-0" />
          )}
          <span className="text-xs font-bold">{statusMessage.text}</span>
        </div>
      )}

      {yildirimAlert && (
        <div className="bg-sky-50 border border-sky-300 rounded-2xl p-3 flex items-start gap-2 shadow-sm">
          <AlertTriangle className="text-sky-600 shrink-0 mt-0.5" size={16} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase text-sky-800 tracking-wider">Yıldırım Tanker Giriş Uyarısı</p>
            <p className="text-xs text-sky-900 mt-0.5">{yildirimAlert}</p>
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('yildirim');
                setYildirimAlert(null);
              }}
              className="mt-2 text-[10px] font-black uppercase tracking-wide text-sky-700 hover:underline cursor-pointer"
            >
              Fiş sekmesine git →
            </button>
          </div>
          <button type="button" onClick={() => setYildirimAlert(null)} className="text-sky-700 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('faaliyet')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'faaliyet'
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <ClipboardList size={14} /> Faaliyet
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('yoklama')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'yoklama'
              ? 'bg-emerald-600 border-emerald-500 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Calendar size={14} /> Yoklama
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('yildirim')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'yildirim'
              ? 'bg-sky-600 border-sky-500 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Truck size={14} /> Yıldırım Tanker
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('sayac')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'sayac'
              ? 'bg-violet-600 border-violet-500 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Gauge size={14} /> Taşeron Sayaç Kesinti
        </button>
      </div>

      {activeSubTab === 'faaliyet' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              {editingFaaliyetId ? 'Faaliyet Düzenle' : 'Yeni Faaliyet'}
            </h3>
            <p className="text-[10px] text-slate-500">
              Çalışma alanı parsel/blok değil — <strong>Kamp / Ofis</strong> bölgesidir.
            </p>

            <form onSubmit={handleSaveFaaliyet} className="space-y-3 text-xs">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFaaliyetGrubu('NORMAL')}
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg cursor-pointer ${
                    faaliyetGrubu === 'NORMAL' ? 'bg-slate-900 text-white' : 'text-slate-500'
                  }`}
                >
                  Normal Faaliyet
                </button>
                <button
                  type="button"
                  onClick={() => setFaaliyetGrubu('MESAI')}
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg cursor-pointer ${
                    faaliyetGrubu === 'MESAI' ? 'bg-amber-500 text-slate-900' : 'text-slate-500'
                  }`}
                >
                  Mesaili Faaliyet
                </button>
              </div>

              <label className="block space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase">Tarih</span>
                <input
                  type="date"
                  value={faaliyetTarih}
                  onChange={(e) => setFaaliyetTarih(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase">İş Niteliği</span>
                <select
                  value={isNiteligi}
                  onChange={(e) => setIsNiteligi(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                >
                  {IS_NITELIGI_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase block">Çalışma Alanı (Kamp–Ofis)</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCalismaAlani('KAMP')}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black border cursor-pointer ${
                      calismaAlani === 'KAMP'
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    KAMP
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalismaAlani('OFİS')}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black border cursor-pointer ${
                      calismaAlani === 'OFİS'
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    OFİS
                  </button>
                </div>
              </div>

              {calismaAlani === 'KAMP' && (
                <label className="block space-y-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Kamp Yerleşkesi</span>
                  {kampYerleskeleri.length > 0 ? (
                    <select
                      value={yerleskeAdi}
                      onChange={(e) => setYerleskeAdi(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      required
                    >
                      <option value="">Seçiniz</option>
                      {kampYerleskeleri.map((y) => (
                        <option key={y.id} value={y.ad}>
                          {y.ad}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={yerleskeAdi}
                      onChange={(e) => setYerleskeAdi(e.target.value)}
                      placeholder="Yerleşke adı"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  )}
                </label>
              )}

              <label className="block space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase">Açıklama *</span>
                <textarea
                  required
                  value={aciklama}
                  onChange={(e) => setAciklama(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
                  placeholder="Yapılan işi kısaca yazın"
                />
              </label>

              <label className="flex items-center justify-center gap-2 w-full bg-slate-50 border border-dashed border-slate-300 rounded-xl px-3 py-3 cursor-pointer hover:bg-slate-100">
                <Camera size={14} className="text-slate-600" />
                <span className="font-bold text-slate-700 text-[10px]">
                  {fotoUrl ? 'Fotoğraf seçildi — değiştir' : 'Faaliyet fotoğrafı'}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFaaliyetFoto} />
              </label>
              {fotoUrl && (
                <img src={fotoUrl} alt="" className="max-h-36 rounded-xl border object-contain bg-slate-50" />
              )}

              {faaliyetGrubu === 'MESAI' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black uppercase text-amber-800">Tesisatçı Mesai Saatleri</p>
                  {tesisatciPersoneller.length === 0 ? (
                    <p className="text-[10px] text-amber-700 italic">TESİSATÇI görevli personel bulunamadı.</p>
                  ) : (
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {tesisatciPersoneller.map((p) => {
                        const hrs = personelMesaiSaatleri[p.id] || 0;
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between gap-2 border rounded-lg px-2 py-1.5 ${
                              hrs > 0 ? 'bg-amber-100 border-amber-300' : 'bg-white border-slate-200'
                            }`}
                          >
                            <span className="text-[9px] font-bold text-slate-800 truncate">
                              {p.ad} {p.soyad}
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={14}
                              step={0.5}
                              value={hrs}
                              onChange={(e) =>
                                setPersonelMesaiSaatleri((prev) => ({
                                  ...prev,
                                  [p.id]: Number(e.target.value) || 0,
                                }))
                              }
                              className="w-16 text-center text-[10px] font-bold border rounded-lg py-1"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingFaaliyet}
                  className="flex-1 bg-slate-900 text-white font-black text-[10px] py-3 rounded-xl disabled:opacity-60 cursor-pointer"
                >
                  {savingFaaliyet ? 'Kaydediliyor…' : editingFaaliyetId ? 'GÜNCELLE' : 'KAYDET'}
                </button>
                {editingFaaliyetId && (
                  <button
                    type="button"
                    onClick={resetFaaliyetForm}
                    className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-[10px] cursor-pointer"
                  >
                    İptal
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                {formatDateLabelTr(faaliyetTarih)} — Kayıtlar ({gunlukFaaliyetler.length})
              </h4>
              <button
                type="button"
                onClick={handleTopluRaporla}
                disabled={gunlukFaaliyetler.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-700 text-white text-[9px] font-black uppercase tracking-wide disabled:opacity-40 cursor-pointer"
              >
                <Printer size={12} />
                Toplu Raporla ({gunlukFaaliyetler.length})
              </button>
            </div>
            {gunlukFaaliyetler.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">Bu tarihte faaliyet yok.</p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto">
                {gunlukFaaliyetler.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">
                        {f.isNiteligi}{' '}
                        <span
                          className={`text-[8px] px-1.5 py-0.5 rounded font-black ${
                            f.faaliyetGrubu === 'MESAI'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {f.faaliyetGrubu === 'MESAI' ? 'MESAİ' : 'NORMAL'}
                        </span>
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        {f.calismaAlani}
                        {f.yerleskeAdi ? ` · ${f.yerleskeAdi}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-1 line-clamp-2">{f.aciklama}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditFaaliyet(f)}
                        className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-pointer"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSilFaaliyet(f)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'yoklama' && setYoklamalar && saveYoklamalarNow && (
        <KampGunlukYoklamaTab
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalar}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          addNotification={addNotification}
          personelKapsami="tesisatci"
        />
      )}

      {activeSubTab === 'yoklama' && (!setYoklamalar || !saveYoklamalarNow) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
          Yoklama kaydı için gerekli bağlantılar yüklenemedi.
        </div>
      )}

      {activeSubTab === 'yildirim' && (
        <TesisatciYildirimTab
          cariKartlar={cariKartlar}
          setCariKartlar={setCariKartlar}
          setCariIslemGecmisi={setCariIslemGecmisi}
          faturalar={faturalar}
          currentUser={currentUser}
          addNotification={addNotification}
          showStatus={showStatus}
        />
      )}

      {activeSubTab === 'sayac' && (
        <TesisatciSayacKesintiTab
          cariKartlar={cariKartlar}
          currentUser={currentUser}
          setCariIslemGecmisi={setCariIslemGecmisi}
          addNotification={addNotification}
          showStatus={showStatus}
        />
      )}
    </div>
  );
};
