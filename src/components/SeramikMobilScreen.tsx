import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Layers, ClipboardList, Camera, CheckCircle, RefreshCw, LogOut, Pencil, Trash2, Calendar, Printer, FileSpreadsheet, History, Users
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Personel, SahaFaaliyeti, SeramikFaaliyet } from '../types/erp';
import { db, cleanUndefined } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey, formatDateLabelTr, normalizeDateKey } from '../lib/dateKeyUtils';
import {
  applySahaMesaiToYoklama,
  mesaiInputDisplayValue,
  normalizeMesaiHours,
  setMesaiHoursInMap,
} from '../lib/sahaFaaliyetUtils';
import { ensureSahaFaaliyetFotolarPersisted } from '../lib/sahaFaaliyetFotoStorage';
import { isSeramikEkibiPersonel } from '../lib/yoklamaUtils';
import { resolveGeldiRolPersonelIds } from '../lib/mobilRolEtiketUtils';
import { PARSEL_BLOK_MAP, PARSEL_LIST, defaultBlokForParsel } from '../data/parselBlokMap';
import {
  buildMobilGunlukFaaliyetReportHtml,
  openMobilGunlukFaaliyetReport,
} from '../lib/mobilGunlukFaaliyetReport';
import { KampGunlukYoklamaTab } from './KampGunlukYoklamaTab';
import {
  goturuGunleriToAylikMap,
  ozetGoturuYoklamaGunleri,
  persistGoturuYoklamaSparse,
  sparseFromGoturuMap,
  subscribeGoturuYoklamalari,
  type GoturuYoklamaGunKaydi,
} from '../lib/goturuYoklamaPersistence';
import { exportGoturuFaaliyetliPuantajExcel } from '../lib/goturuPuantajExcel';
import { GoturuPersonelIslemleriTab } from './GoturuPersonelIslemleriTab';

interface SeramikMobilScreenProps {
  personeller: Personel[];
  yoklamalar?: unknown;
  setYoklamalar?: unknown;
  saveYoklamalarNow?: unknown;
  currentUser: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
}

const IS_NITELIGI_OPTIONS = [
  'Seramik Örme',
  'Seramik İmalatı',
  'Pit Çukuru Seramik',
  'Banyo Seramik',
  'Fayans Döşeme',
  'Derz / Tamirat',
  'Diğer',
];

export const SeramikMobilScreen: React.FC<SeramikMobilScreenProps> = ({
  personeller,
  currentUser,
  onSignOut,
  isStandalone = false,
  addNotification,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'faaliyet' | 'yoklama' | 'personel' | 'rapor'>('faaliyet');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const statusHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = (type: 'success' | 'error' | 'info', text: string, autoHideMs = 4000) => {
    if (statusHideTimer.current) clearTimeout(statusHideTimer.current);
    setStatusMessage({ type, text });
    if (type !== 'info' && autoHideMs > 0) {
      statusHideTimer.current = setTimeout(() => setStatusMessage(null), autoHideMs);
    }
  };

  const [faaliyetGrubu, setFaaliyetGrubu] = useState<'NORMAL' | 'MESAI'>('NORMAL');
  const [isNiteligi, setIsNiteligi] = useState(IS_NITELIGI_OPTIONS[0]);
  const [parsel, setParsel] = useState(PARSEL_LIST[0] || 'GENEL SAHA');
  const [blok, setBlok] = useState(defaultBlokForParsel(PARSEL_LIST[0] || 'GENEL SAHA'));
  const [faaliyetTarih, setFaaliyetTarih] = useState(todayDateKey());
  const [aciklama, setAciklama] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [personelMesaiSaatleri, setPersonelMesaiSaatleri] = useState<Record<string, number>>({});
  const [savingFaaliyet, setSavingFaaliyet] = useState(false);
  const [faaliyetler, setFaaliyetler] = useState<SeramikFaaliyet[]>([]);
  const [editingFaaliyetId, setEditingFaaliyetId] = useState<string | null>(null);
  const [goturuGunler, setGoturuGunler] = useState<GoturuYoklamaGunKaydi[]>([]);
  const [yoklamaDate, setYoklamaDate] = useState(todayDateKey());
  const [raporAy, setRaporAy] = useState(() => todayDateKey().slice(0, 7));
  const [excelUretiyor, setExcelUretiyor] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'seramikFaaliyetleri'), (snap) => {
      const list: SeramikFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SeramikFaaliyet, 'id'>) }));
      list.sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
      setFaaliyetler(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => subscribeGoturuYoklamalari(setGoturuGunler), []);

  const goturuYoklamalar = useMemo(() => goturuGunleriToAylikMap(goturuGunler), [goturuGunler]);
  const gecmisOzet = useMemo(
    () => ozetGoturuYoklamaGunleri(goturuGunler, raporAy),
    [goturuGunler, raporAy]
  );

  const seramikPersoneller = useMemo(
    () => personeller.filter((p) => isSeramikEkibiPersonel(p)),
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
      rol: 'GÖTÜRÜ',
      anchorDate: faaliyetTarih,
      records: gunlukFaaliyetler,
      olusturan: currentUser?.email || 'Götürü',
    });
    openMobilGunlukFaaliyetReport(
      html,
      `Götürü / Seramik Günlük Rapor — ${formatDateLabelTr(faaliyetTarih)}`
    );
  };

  const blokOptions = PARSEL_BLOK_MAP[parsel] || [];

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
    setParsel(PARSEL_LIST[0] || 'GENEL SAHA');
    setBlok(defaultBlokForParsel(PARSEL_LIST[0] || 'GENEL SAHA'));
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
    const gonderen = currentUser?.email || 'goturu';
    let draft = goturuYoklamalar;
    if (prevMap && Object.keys(prevMap).length) {
      draft = applySahaMesaiToYoklama(draft, tarih, prevMap, gonderen, 'subtract');
    }
    if (nextMap && Object.keys(nextMap).length) {
      draft = applySahaMesaiToYoklama(draft, tarih, nextMap, gonderen, 'add');
    }
    const sparse = sparseFromGoturuMap(draft, tarih);
    await persistGoturuYoklamaSparse({
      sparse,
      existingGunler: goturuGunler,
      personeller,
      kaydeden: gonderen,
      fallbackDate: normalizeDateKey(tarih),
    });
  };

  const saveGoturuYoklamaNow = async (sparse: import('../types/erp').AylikYoklamaMap) => {
    await persistGoturuYoklamaSparse({
      sparse,
      existingGunler: goturuGunler,
      personeller,
      kaydeden: currentUser?.email || 'goturu',
      fallbackDate: yoklamaDate,
    });
  };

  const handleExcelUret = async () => {
    const [ys, ms] = raporAy.split('-').map(Number);
    if (!ys || !ms) return;
    setExcelUretiyor(true);
    showStatus('info', 'Aylık faaliyetli puantaj Excel hazırlanıyor…', 0);
    try {
      await exportGoturuFaaliyetliPuantajExcel({
        year: ys,
        month: ms,
        gunler: goturuGunler,
        faaliyetler,
        personeller,
      });
      showStatus('success', 'Kibritçi antetli Excel indirildi.');
    } catch (err: any) {
      showStatus('error', 'Excel üretilemedi: ' + (err?.message || ''));
    } finally {
      setExcelUretiyor(false);
    }
  };

  const handleSaveFaaliyet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aciklama.trim()) {
      showStatus('error', 'İmalat açıklaması zorunlu.');
      return;
    }
    if (!parsel.trim()) {
      showStatus('error', 'Parsel seçin.');
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
      const id = editingFaaliyetId || `srf_${Date.now()}`;
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

      const kaydedenEmail = String(currentUser?.email || 'goturu').trim().toLowerCase();
      let aktifPersonelListesi: string[] = [];
      if (mesaiMap && Object.keys(mesaiMap).length > 0) {
        aktifPersonelListesi = Object.keys(mesaiMap);
      } else {
        aktifPersonelListesi = resolveGeldiRolPersonelIds(
          personeller,
          goturuYoklamalar,
          normalizeDateKey(faaliyetTarih),
          'SERAMIK',
          { ensureEmail: kaydedenEmail }
        );
        if (aktifPersonelListesi.length === 0 && existing?.aktifPersonelListesi?.length) {
          aktifPersonelListesi = [...existing.aktifPersonelListesi];
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
        console.warn('Seramik foto Storage atlandı:', fotoErr);
      }

      const payload: Record<string, unknown> = {
        id,
        tarih: normalizeDateKey(faaliyetTarih),
        faaliyetGrubu,
        isNiteligi,
        parsel,
        blok: blok || 'GENEL SAHA',
        aciklama: aciklama.trim(),
        fotoUrl: fotoPayload.fotoUrl,
        fotoUrls: fotoPayload.fotoUrls?.length ? fotoPayload.fotoUrls : [],
        aktifPersonelListesi,
        durum: 'ONAY BEKLİYOR',
        kaydeden: currentUser?.email || 'goturu',
        kaynakEkran: 'SERAMIK_MOBIL',
        olusturulma: existing?.olusturulma || new Date().toISOString(),
        guncellenme: new Date().toISOString(),
      };
      if (mesaiMap && Object.keys(mesaiMap).length > 0) {
        payload.personelMesaiSaatleri = mesaiMap;
      } else {
        payload.personelMesaiSaatleri = null;
      }

      await setDoc(doc(db, 'seramikFaaliyetleri', id), cleanUndefined(payload));

      if (faaliyetGrubu === 'MESAI' || existing?.faaliyetGrubu === 'MESAI') {
        await syncMesai(
          String(payload.tarih),
          faaliyetGrubu === 'MESAI' && mesaiMap ? mesaiMap : undefined,
          existing?.faaliyetGrubu === 'MESAI' ? existing.personelMesaiSaatleri : undefined
        );
      }

      if (addNotification) {
        await addNotification(
          `Götürü ${faaliyetGrubu === 'MESAI' ? 'mesai ' : ''}faaliyeti: ${isNiteligi} (${payload.parsel} / ${payload.blok})`
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

  const handleEditFaaliyet = (f: SeramikFaaliyet) => {
    setEditingFaaliyetId(f.id);
    setFaaliyetTarih(normalizeDateKey(f.tarih));
    setFaaliyetGrubu(f.faaliyetGrubu || 'NORMAL');
    setIsNiteligi(f.isNiteligi || IS_NITELIGI_OPTIONS[0]);
    setParsel(f.parsel || PARSEL_LIST[0]);
    setBlok(f.blok || defaultBlokForParsel(f.parsel || PARSEL_LIST[0]));
    setAciklama(f.aciklama || '');
    setFotoUrl(f.fotoUrl || '');
    setPersonelMesaiSaatleri(f.personelMesaiSaatleri || {});
  };

  const handleSilFaaliyet = async (f: SeramikFaaliyet) => {
    if (!window.confirm('Bu faaliyet silinsin mi?')) return;
    try {
      await deleteDoc(doc(db, 'seramikFaaliyetleri', f.id));
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
          <div className="p-2.5 bg-orange-100 rounded-2xl">
            <Layers className="text-orange-800" size={22} />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-wide">Götürü / Seramik Mobil</h1>
            <p className="text-[10px] text-slate-500">
              Seramik ekibi faaliyeti · Personel giriş / çıkış · Yoklama · Aylık puantaj
            </p>
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
          onClick={() => setActiveSubTab('personel')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'personel'
              ? 'bg-orange-600 border-orange-500 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Users size={14} /> Personel
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('rapor')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'rapor'
              ? 'bg-amber-700 border-amber-600 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet size={14} /> Puantaj / Rapor
        </button>
      </div>

      {activeSubTab === 'faaliyet' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              {editingFaaliyetId ? 'Faaliyet Düzenle' : 'Yeni İmalat Faaliyeti'}
            </h3>
            <p className="text-[10px] text-slate-500">
              Açıklama + fotoğraf; konum <strong>parsel / blok</strong> ile seçilir.
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

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Parsel *</span>
                  <select
                    required
                    value={parsel}
                    onChange={(e) => {
                      const next = e.target.value;
                      setParsel(next);
                      setBlok(defaultBlokForParsel(next));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                  >
                    {PARSEL_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Blok *</span>
                  <select
                    required
                    value={blok}
                    onChange={(e) => setBlok(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                  >
                    {blokOptions.length === 0 ? (
                      <option value="GENEL SAHA">GENEL SAHA</option>
                    ) : (
                      blokOptions.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase">İmalat Açıklaması *</span>
                <textarea
                  required
                  value={aciklama}
                  onChange={(e) => setAciklama(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
                  placeholder="Yapılan imalatı kısaca yazın"
                />
              </label>

              <label className="flex items-center justify-center gap-2 w-full bg-slate-50 border border-dashed border-slate-300 rounded-xl px-3 py-3 cursor-pointer hover:bg-slate-100">
                <Camera size={14} className="text-slate-600" />
                <span className="font-bold text-slate-700 text-[10px]">
                  {fotoUrl ? 'Fotoğraf seçildi — değiştir' : 'İmalat fotoğrafı'}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFaaliyetFoto} />
              </label>
              {fotoUrl && (
                <img src={fotoUrl} alt="" className="max-h-36 rounded-xl border object-contain bg-slate-50" />
              )}

              {faaliyetGrubu === 'MESAI' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black uppercase text-amber-800">Seramik Ekibi Mesai Saatleri</p>
                  {seramikPersoneller.length === 0 ? (
                    <p className="text-[10px] text-amber-700 italic">Seramik ekibi personeli bulunamadı (görev: SERAMİKÇİ veya firma: SERAMİK EKİBİ).</p>
                  ) : (
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {seramikPersoneller.map((p) => {
                        const hrs = personelMesaiSaatleri[p.id];
                        const hasHrs = Number(hrs) > 0;
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between gap-2 border rounded-lg px-2 py-1.5 ${
                              hasHrs ? 'bg-amber-100 border-amber-300' : 'bg-white border-slate-200'
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
                              placeholder="—"
                              value={mesaiInputDisplayValue(hrs)}
                              onChange={(e) =>
                                setPersonelMesaiSaatleri((prev) =>
                                  setMesaiHoursInMap(prev, p.id, e.target.value)
                                )
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-700 text-white text-[9px] font-black uppercase tracking-wide disabled:opacity-40 cursor-pointer"
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
                    <div className="min-w-0 flex gap-2">
                      {f.fotoUrl ? (
                        <img src={f.fotoUrl} alt="" className="w-12 h-12 rounded-lg object-cover border shrink-0" />
                      ) : null}
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
                          {f.parsel} · {f.blok}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-1 line-clamp-2">{f.aciklama}</p>
                      </div>
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

      {activeSubTab === 'yoklama' && (
        <div className="space-y-3">
          <p className="text-[10px] text-slate-500 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 max-w-[420px] mx-auto">
            Bu yoklama ana Yoklama ve Puantaj ekranından ayrı tutulur. Aylık Excel ve geçmiş liste
            Puantaj / Rapor sekmesindedir.
          </p>
        <KampGunlukYoklamaTab
          personeller={personeller}
          yoklamalar={goturuYoklamalar}
          saveYoklamalarNow={saveGoturuYoklamaNow}
          currentUser={currentUser}
          addNotification={addNotification}
          personelKapsami="seramik"
          dateKey={yoklamaDate}
          onDateKeyChange={setYoklamaDate}
          lastSaveStorageKey="goturu_gunluk_yoklama_last"
          hideQuickExport
        />
        </div>
      )}

      {activeSubTab === 'personel' && (
        <GoturuPersonelIslemleriTab
          personeller={personeller}
          currentUser={currentUser}
          showStatus={showStatus}
        />
      )}

      {activeSubTab === 'rapor' && (
        <div className="space-y-4 max-w-3xl">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
                  Rapor ayı
                </span>
                <input
                  type="month"
                  value={raporAy}
                  onChange={(e) => setRaporAy(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleExcelUret()}
                disabled={excelUretiyor}
                className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-black text-[11px] px-4 py-2.5 rounded-xl cursor-pointer"
              >
                <FileSpreadsheet size={14} />
                {excelUretiyor ? 'Hazırlanıyor…' : 'Aylık Faaliyetli Puantaj Excel Üret'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              Excel Kibritçi antet/logo ile iner. Puantaj sayfası Götürü yoklamasını (ana puantajdan ayrı)
              ve o ayın seramik faaliyetlerini birleştirir. G = geldi, Y = yok, F = faaliyet.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <History size={16} className="text-orange-700" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Geçmiş yoklamalar
              </h3>
              <span className="ml-auto text-[10px] font-bold text-slate-400">
                {gecmisOzet.length} gün
              </span>
            </div>
            {gecmisOzet.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic py-4 text-center">
                Bu ay henüz Götürü yoklaması kaydı yok.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {gecmisOzet.map((g) => (
                  <button
                    key={g.tarih}
                    type="button"
                    onClick={() => {
                      setYoklamaDate(g.tarih);
                      setActiveSubTab('yoklama');
                    }}
                    className="w-full text-left py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 rounded-lg px-1 cursor-pointer"
                  >
                    <div>
                      <p className="text-[12px] font-black text-slate-800">{formatDateLabelTr(g.tarih)}</p>
                      <p className="text-[9px] text-slate-400">
                        {g.kaydeden || '—'}
                        {g.guncellenme
                          ? ` · ${new Date(g.guncellenme).toLocaleString('tr-TR')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 text-[10px] font-extrabold">
                      <span className="text-emerald-700">Geldi {g.geldi}</span>
                      <span className="text-rose-600">Yok {g.yok}</span>
                      {g.mesaiToplam > 0 ? (
                        <span className="text-amber-700">+{g.mesaiToplam}s</span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
