/**
 * Şöför / Operatör mobil — NORMAL + MESAİ faaliyet + günlük yoklama.
 * Mermerci/Tesisatçı ile aynı model: Faaliyeti Olan Personeller + ZER hakediş besler.
 * Yoklama yalnızca sparse (dokunulan hücreler) yazar — mevcut haritayı ezmez.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Camera,
  CheckCircle,
  RefreshCw,
  Pencil,
  Trash2,
  Calendar,
  Truck,
  HardHat,
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { AylikYoklamaMap, AracBakim, CariKart, Personel, SoforSahaFaaliyet, OperatorSahaFaaliyet } from '../types/erp';
import { db, cleanUndefined, withTimeout } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey, formatDateLabelTr, normalizeDateKey } from '../lib/dateKeyUtils';
import {
  applySahaMesaiToYoklama,
  ensureGeldiForPersoneller,
  mesaiInputDisplayValue,
  normalizeMesaiHours,
  setMesaiHoursInMap,
} from '../lib/sahaFaaliyetUtils';
import { ensureSahaFaaliyetFotolarPersisted } from '../lib/sahaFaaliyetFotoStorage';
import { isOperatorGorev, isSoforGorev, getYoklamaDay, setYoklamaDay } from '../lib/yoklamaUtils';
import { resolveGeldiRolPersonelIds, type MobilRolEtiket } from '../lib/mobilRolEtiketUtils';
import { getTaseronCariKartlar, buildOperatorIsKaydiEtiketi, isIsMakinesiArac } from '../lib/taseronUtils';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import { PARSEL_BLOK_MAP, PARSEL_LIST, defaultBlokForParsel } from '../data/parselBlokMap';
import { KampGunlukYoklamaTab } from './KampGunlukYoklamaTab';

/** Inline data URL Firestore'a yazılmaz — büyük payload timeout üretir */
function isSafeHttpFoto(url?: string | null): boolean {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) || u.startsWith('blob:');
}

type Rol = 'SOFOR' | 'OPERATOR';
type Kayit = SoforSahaFaaliyet | OperatorSahaFaaliyet;

const SOFOR_IS_OPTIONS = [
  'Malzeme Taşıma',
  'Personel Servisi',
  'Mikser / Beton',
  'Hafriyat Nakli',
  'Şantiye İçi Transfer',
  'Dış Rota / Tedarik',
  'Diğer',
];

const OPERATOR_IS_OPTIONS = [
  'Kazı / Hafriyat',
  'Dolgu / Serim',
  'Yükleme',
  'Saha Temizlik',
  'Blok / Parsel İmalat Destek',
  'Diğer İş Makinesi',
];

interface RolMobilFaaliyetYoklamaPanelProps {
  rol: Rol;
  personeller: Personel[];
  cariKartlar?: CariKart[];
  /** Operatör saha faaliyetinde iş makinesi seçimi için */
  araclar?: AracBakim[];
  yoklamalar?: AylikYoklamaMap;
  setYoklamalar?: (updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)) => void;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  currentUser: any;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
  /** false ise sadece faaliyet (üst sekme zaten yoklama ayırıyorsa) */
  showYoklamaTab?: boolean;
  initialSubTab?: 'faaliyet' | 'yoklama';
}

export const RolMobilFaaliyetYoklamaPanel: React.FC<RolMobilFaaliyetYoklamaPanelProps> = ({
  rol,
  personeller,
  cariKartlar = [],
  araclar = [],
  yoklamalar = {},
  setYoklamalar,
  saveYoklamalarNow,
  currentUser,
  addNotification,
  showYoklamaTab = true,
  initialSubTab = 'faaliyet',
}) => {
  const collectionName = rol === 'SOFOR' ? 'soforSahaFaaliyetleri' : 'operatorSahaFaaliyetleri';
  const kaynakEkran = rol === 'SOFOR' ? 'SOFOR_MOBIL' : 'OPERATOR_MOBIL';
  const etiketRol = (rol === 'SOFOR' ? 'SOFOR' : 'OPERATOR') as MobilRolEtiket;
  const isOptions = rol === 'SOFOR' ? SOFOR_IS_OPTIONS : OPERATOR_IS_OPTIONS;
  const TitleIcon = rol === 'SOFOR' ? Truck : HardHat;
  const title = rol === 'SOFOR' ? 'Şöför Saha Faaliyeti' : 'Operatör Saha Faaliyeti';
  const matchGorev = rol === 'SOFOR' ? isSoforGorev : isOperatorGorev;

  const [activeSubTab, setActiveSubTab] = useState<'faaliyet' | 'yoklama'>(initialSubTab);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const statusHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = (type: 'success' | 'error' | 'info', text: string, autoHideMs = 4000) => {
    if (statusHideTimer.current) clearTimeout(statusHideTimer.current);
    setStatusMessage({ type, text });
    if (type !== 'info' && autoHideMs > 0) {
      statusHideTimer.current = setTimeout(() => setStatusMessage(null), autoHideMs);
    }
  };

  const [faaliyetGrubu, setFaaliyetGrubu] = useState<'NORMAL' | 'MESAI'>('NORMAL');
  const [isNiteligi, setIsNiteligi] = useState(isOptions[0]);
  const [parsel, setParsel] = useState(PARSEL_LIST[0] || 'GENEL SAHA');
  const [blok, setBlok] = useState(defaultBlokForParsel(PARSEL_LIST[0] || 'GENEL SAHA'));
  const [faaliyetTarih, setFaaliyetTarih] = useState(todayDateKey());
  const [aciklama, setAciklama] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [personelMesaiSaatleri, setPersonelMesaiSaatleri] = useState<Record<string, number>>({});
  const [savingFaaliyet, setSavingFaaliyet] = useState(false);
  const [faaliyetler, setFaaliyetler] = useState<Kayit[]>([]);
  const [editingFaaliyetId, setEditingFaaliyetId] = useState<string | null>(null);
  const [taseronKesintiAcik, setTaseronKesintiAcik] = useState(false);
  const [taseronCariId, setTaseronCariId] = useState('');
  const [makineKaynak, setMakineKaynak] = useState<'DEMIRBAS' | 'KIRALIK' | 'MANUEL'>('DEMIRBAS');
  const [selectedAracId, setSelectedAracId] = useState('');
  const [makineManuelAd, setMakineManuelAd] = useState('');
  const [operatorTipi, setOperatorTipi] = useState<'JCB' | 'KATO' | 'KİRALIK' | 'DİĞER'>('JCB');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, collectionName),
      (snap) => {
        const list: Kayit[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Kayit, 'id'>) }));
        list.sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
        setFaaliyetler(list);
      },
      (err) => {
        console.error(`${collectionName} dinlenemedi:`, err);
        showStatus('error', formatFirestoreWriteError(err, 'Faaliyet listesi okunamadı.'), 8000);
      }
    );
    return () => unsub();
  }, [collectionName]);

  const rolPersoneller = useMemo(
    () =>
      personeller
        .filter((p) => p.durum !== false && matchGorev(p.gorev))
        .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')),
    [personeller, matchGorev]
  );

  const taseronCariler = useMemo(() => getTaseronCariKartlar(cariKartlar), [cariKartlar]);

  const ismakineAraclari = useMemo(
    () => araclar.filter((a) => isIsMakinesiArac(a as any)),
    [araclar]
  );

  const canliMakineEtiketi = useMemo(() => {
    const arac = araclar.find((a) => a.id === selectedAracId);
    return buildOperatorIsKaydiEtiketi({
      makineKaynak,
      operatorTipi,
      makineManuelAd: makineKaynak === 'MANUEL' ? makineManuelAd : undefined,
      aracPlaka: makineKaynak === 'MANUEL' ? makineManuelAd : arac?.plaka,
    });
  }, [makineKaynak, operatorTipi, makineManuelAd, selectedAracId, araclar]);

  const gunlukFaaliyetler = useMemo(
    () => faaliyetler.filter((f) => normalizeDateKey(f.tarih) === normalizeDateKey(faaliyetTarih)),
    [faaliyetler, faaliyetTarih]
  );

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
      const compressed = await compressImage(raw, 1280, 1280, 0.72, 5000);
      setFotoUrl(compressed);
    } catch {
      showStatus('error', 'Fotoğraf okunamadı.');
    }
  };

  const resetFaaliyetForm = () => {
    setEditingFaaliyetId(null);
    setFaaliyetGrubu('NORMAL');
    setIsNiteligi(isOptions[0]);
    setParsel(PARSEL_LIST[0] || 'GENEL SAHA');
    setBlok(defaultBlokForParsel(PARSEL_LIST[0] || 'GENEL SAHA'));
    // Seçili tarih KORUNUR — geçmiş güne kayıt sonrası liste boşalmasın / tarih kaybolmasın
    setAciklama('');
    setFotoUrl('');
    setPersonelMesaiSaatleri({});
    setTaseronKesintiAcik(false);
    setTaseronCariId('');
    setMakineKaynak('DEMIRBAS');
    setSelectedAracId('');
    setMakineManuelAd('');
    setOperatorTipi('JCB');
  };

  const syncMesai = async (
    tarih: string,
    nextMap?: Record<string, number>,
    prevMap?: Record<string, number>
  ) => {
    if (!saveYoklamalarNow && !setYoklamalar) return;
    const gonderen = String(currentUser?.email || kaynakEkran);
    let draft = yoklamalar;
    if (prevMap && Object.keys(prevMap).length) {
      draft = applySahaMesaiToYoklama(draft, tarih, prevMap, gonderen, 'subtract');
    }
    if (nextMap && Object.keys(nextMap).length) {
      draft = applySahaMesaiToYoklama(draft, tarih, nextMap, gonderen, 'add');
    }
    const dk = normalizeDateKey(tarih);
    const [y, m, d] = dk.split('-').map(Number);
    const touched = new Set([
      ...Object.keys(prevMap || {}),
      ...Object.keys(nextMap || {}),
    ]);
    const sparse: AylikYoklamaMap = {};
    for (const pid of touched) {
      const cell = getYoklamaDay(draft[pid], y, m, d);
      if (!cell) continue;
      sparse[pid] = setYoklamaDay({}, y, m, d, cell) as any;
    }
    if (Object.keys(sparse).length === 0) return;
    if (saveYoklamalarNow) {
      await saveYoklamalarNow(sparse);
    } else if (setYoklamalar) {
      setYoklamalar(draft);
    }
  };

  /** Faaliyet personeline yoklama yoksa Geldi yaz */
  const syncGeldiFromFaaliyet = async (tarih: string, personelIds: string[]) => {
    if (!saveYoklamalarNow && !setYoklamalar) return;
    if (!personelIds.length) return;
    const gonderen = String(currentUser?.email || kaynakEkran);
    const { next, touchedIds } = ensureGeldiForPersoneller(yoklamalar, tarih, personelIds, gonderen);
    if (touchedIds.length === 0) return;
    const dk = normalizeDateKey(tarih);
    const [y, m, d] = dk.split('-').map(Number);
    const sparse: AylikYoklamaMap = {};
    for (const pid of touchedIds) {
      const cell = getYoklamaDay(next[pid], y, m, d);
      if (!cell) continue;
      sparse[pid] = setYoklamaDay({}, y, m, d, cell) as any;
    }
    if (Object.keys(sparse).length === 0) return;
    if (saveYoklamalarNow) {
      await saveYoklamalarNow(sparse);
    } else if (setYoklamalar) {
      setYoklamalar(next);
    }
  };

  const handleSaveFaaliyet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aciklama.trim()) {
      showStatus('error', 'Açıklama zorunlu.');
      return;
    }
    const tarihKey = normalizeDateKey(faaliyetTarih);
    if (!tarihKey || !/^\d{4}-\d{2}-\d{2}$/.test(tarihKey)) {
      showStatus('error', 'Geçerli bir tarih seçin.');
      return;
    }
    setSavingFaaliyet(true);
    showStatus('info', 'Kaydediliyor…', 0);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) {
        showStatus('error', authBlock, 10000);
        return;
      }

      const kaydedenEmail = String(currentUser?.email || '').trim().toLowerCase();
      const existing = editingFaaliyetId
        ? faaliyetler.find((f) => f.id === editingFaaliyetId)
        : undefined;
      const id = editingFaaliyetId || `${rol.toLowerCase()}_sf_${Date.now()}`;

      let mesaiMap: Record<string, number> | undefined;
      if (faaliyetGrubu === 'MESAI') {
        mesaiMap = Object.fromEntries(
          Object.entries(personelMesaiSaatleri)
            .map(([pid, h]) => [pid, normalizeMesaiHours(Number(h))] as const)
            .filter(([, h]) => h > 0)
        );
        if (mesaiMap && Object.keys(mesaiMap).length === 0) {
          showStatus('error', 'Mesaili faaliyet için en az bir personele saat girin (0 olamaz).', 8000);
          return;
        }
      }

      if (rol === 'OPERATOR' && faaliyetGrubu === 'MESAI' && taseronKesintiAcik && !taseronCariId) {
        showStatus('error', 'Taşeron kesintisi için taşeron firma seçin.');
        return;
      }

      let makineFields: Partial<OperatorSahaFaaliyet> = {};
      if (rol === 'OPERATOR') {
        if (makineKaynak === 'MANUEL' && !makineManuelAd.trim()) {
          showStatus('error', 'Manuel makine adı / plaka girin.');
          return;
        }
        if (makineKaynak !== 'MANUEL' && !selectedAracId) {
          showStatus('error', 'İş makinesi seçin (veya Manuel kaynak kullanın).');
          return;
        }
        const arac = araclar.find((a) => a.id === selectedAracId);
        const aracPlaka =
          makineKaynak === 'MANUEL' ? makineManuelAd.trim() : arac?.plaka || makineManuelAd.trim();
        const isKaydiEtiketi = buildOperatorIsKaydiEtiketi({
          makineKaynak,
          operatorTipi,
          makineManuelAd: makineKaynak === 'MANUEL' ? makineManuelAd.trim() : undefined,
          aracPlaka,
        });
        makineFields = {
          aracId: makineKaynak === 'MANUEL' ? `manuel_${Date.now()}` : selectedAracId,
          aracPlaka: aracPlaka || undefined,
          makineKaynak,
          makineManuelAd: makineKaynak === 'MANUEL' ? makineManuelAd.trim() : undefined,
          operatorTipi,
          isKaydiEtiketi,
        };
      }

      let aktifPersonelListesi: string[] = [];
      if (mesaiMap && Object.keys(mesaiMap).length > 0) {
        aktifPersonelListesi = Object.keys(mesaiMap);
      } else {
        aktifPersonelListesi = resolveGeldiRolPersonelIds(
          personeller,
          yoklamalar,
          tarihKey,
          etiketRol,
          { ensureEmail: kaydedenEmail }
        );
      }

      let fotoPersisted = fotoUrl || '';
      let fotoUyari = '';
      if (fotoPersisted.startsWith('data:')) {
        try {
          const ensured = await ensureSahaFaaliyetFotolarPersisted({
            id,
            tarih: tarihKey,
            fotoUrl: fotoPersisted,
          } as any);
          fotoPersisted = String(ensured.fotoUrl || '');
        } catch (fotoErr) {
          console.warn('Foto yükleme atlandı:', fotoErr);
          fotoUyari = ' Fotoğraf yüklenemedi; kayıt fotosuz kaydedildi.';
          fotoPersisted = '';
        }
      }
      // data: URL asla Firestore'a gitmesin (mobilde timeout / 1MB limiti)
      if (fotoPersisted.startsWith('data:') || !isSafeHttpFoto(fotoPersisted)) {
        if (fotoPersisted.startsWith('data:')) {
          fotoUyari =
            fotoUyari ||
            ' Fotoğraf Storage’a yüklenemedi; kayıt fotosuz kaydedildi (yeniden deneyebilirsiniz).';
        }
        fotoPersisted = '';
      }

      const taseronCari = taseronCariler.find((c) => c.id === taseronCariId);
      let bagliOperatorFaaliyetId: string | undefined;

      // Operatör mesai + taşeron kesinti → ayrı kesinti kaydı (onay havuzuna)
      if (rol === 'OPERATOR' && faaliyetGrubu === 'MESAI' && taseronKesintiAcik && taseronCari && mesaiMap) {
        const toplamSaat = Object.values(mesaiMap).reduce((s, h) => s + Number(h || 0), 0);
        const ofId = existing && (existing as OperatorSahaFaaliyet).bagliOperatorFaaliyetId
          ? String((existing as OperatorSahaFaaliyet).bagliOperatorFaaliyetId)
          : `of_mesai_${Date.now()}`;
        const firstPid = aktifPersonelListesi[0];
        const firstP = personeller.find((p) => p.id === firstPid);
        const kesintiFoto = isSafeHttpFoto(fotoPersisted) ? fotoPersisted : null;
        await withTimeout(
          () =>
            setDoc(
              doc(db, 'operatorFaaliyetleri', ofId),
              cleanUndefined({
                id: ofId,
                aracId: makineFields.aracId || 'mesai_saha',
                aracPlaka: makineFields.aracPlaka || 'MESAİ SAHA',
                operatorPersonelId: firstPid,
                operatorIsim: firstP ? `${firstP.ad} ${firstP.soyad}` : kaydedenEmail || 'Operatör',
                operatorTipi: makineFields.operatorTipi || 'DİĞER',
                tarih: tarihKey,
                baslangicSaat: '17:00',
                bitisSaat: '17:00',
                calismaSuresi: Math.round(toplamSaat * 100) / 100,
                yapilanIs: `[Mesai kesinti] ${aciklama.trim()} · ${isNiteligi} (${parsel}/${blok})`,
                firmaAdi: taseronCari.unvan,
                firmaId: taseronCari.id,
                fotoUrl: kesintiFoto,
                makineKaynak: makineFields.makineKaynak || 'MANUEL',
                makineManuelAd: makineFields.makineManuelAd || makineFields.aracPlaka || 'Mesai saha',
                isKaydiEtiketi: makineFields.isKaydiEtiketi || 'Mesai taşeron kesinti',
                onayDurumu: 'BEKLEMEDE',
                durum: 'ONAY BEKLİYOR',
                kaydedenKullanici: kaydedenEmail,
                kayitTarihi: new Date().toISOString(),
              })
            ),
          20000,
          2
        );
        bagliOperatorFaaliyetId = ofId;
      }

      const needsOnay = rol === 'OPERATOR';
      const willSyncMesai =
        faaliyetGrubu === 'MESAI' && Boolean(mesaiMap && Object.keys(mesaiMap).length > 0);
      const payload: Kayit = {
        id,
        tarih: tarihKey,
        faaliyetGrubu,
        isNiteligi,
        parsel,
        blok,
        aciklama: aciklama.trim(),
        fotoUrl: fotoPersisted || null,
        aktifPersonelListesi,
        personelMesaiSaatleri: mesaiMap,
        durum: needsOnay ? 'ONAY BEKLİYOR' : 'KAYITLI',
        kaydeden: kaydedenEmail || undefined,
        kaynakEkran: kaynakEkran as any,
        olusturulma: existing?.olusturulma || new Date().toISOString(),
        guncellenme: new Date().toISOString(),
        ...(rol === 'OPERATOR'
          ? {
              taseronKesinti: faaliyetGrubu === 'MESAI' && taseronKesintiAcik,
              taseronFirmaId: taseronKesintiAcik ? taseronCariId || null : null,
              taseronFirmaAdi: taseronKesintiAcik ? taseronCari?.unvan || null : null,
              bagliOperatorFaaliyetId: bagliOperatorFaaliyetId || null,
              mesaiYoklamayaIslendi: willSyncMesai ? true : null,
              ...makineFields,
            }
          : {}),
      };

      if (faaliyetGrubu !== 'MESAI') {
        (payload as any).personelMesaiSaatleri = null;
        if (rol === 'OPERATOR') (payload as any).mesaiYoklamayaIslendi = null;
      }

      await withTimeout(
        () => setDoc(doc(db, collectionName, id), cleanUndefined(payload)),
        20000,
        2
      );

      // Anında listede görünsün (snapshot gecikse bile)
      setFaaliyetler((prev) => {
        const rest = prev.filter((x) => x.id !== id);
        return [payload, ...rest].sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
      });
      // Seçili tarihi kayda sabitle (normalize)
      setFaaliyetTarih(tarihKey);

      // Yoklama: 1) durum yoksa Geldi  2) mesaili ise saatleri yaz
      // (Operatörde eskiden mesai yalnızca onayda yazılıyordu — kayıpta görünmüyordu.)
      try {
        await syncGeldiFromFaaliyet(String(payload.tarih), aktifPersonelListesi);

        if (faaliyetGrubu === 'MESAI' || existing?.faaliyetGrubu === 'MESAI') {
          await syncMesai(
            String(payload.tarih),
            faaliyetGrubu === 'MESAI' && mesaiMap ? mesaiMap : undefined,
            existing?.faaliyetGrubu === 'MESAI' ? existing.personelMesaiSaatleri : undefined
          );
        }
      } catch (yoklamaErr) {
        console.warn('Yoklama / mesai senkronu atlandı:', yoklamaErr);
        fotoUyari +=
          ' Faaliyet kaydı yazıldı; yoklama senkronu gecikti — Yoklama sekmesinden kontrol edin.';
      }

      if (addNotification) {
        try {
          void addNotification(
            `${rol === 'SOFOR' ? 'Şöför' : 'Operatör'} ${
              faaliyetGrubu === 'MESAI' ? 'mesai ' : ''
            }faaliyeti${needsOnay ? ' (onay bekliyor)' : ''}: ${isNiteligi} (${payload.parsel} / ${payload.blok})`
          );
        } catch (nErr) {
          console.warn('Bildirim atlandı:', nErr);
        }
      }
      showStatus(
        'success',
        (editingFaaliyetId
          ? 'Faaliyet güncellendi.'
          : needsOnay
            ? `Faaliyet kaydedildi (${formatDateLabelTr(tarihKey)}) — onay havuzuna düştü.`
            : `Faaliyet kaydedildi (${formatDateLabelTr(tarihKey)}).`) +
          (willSyncMesai ? ' Mesai yoklamaya işlendi.' : '') +
          ' Yoklama durumu yoksa Geldi işaretlendi.' +
          fotoUyari,
        7000
      );
      resetFaaliyetForm();
    } catch (err: any) {
      console.error(err);
      showStatus('error', formatFirestoreWriteError(err, 'Kayıt başarısız'), 10000);
    } finally {
      setSavingFaaliyet(false);
    }
  };

  const handleEditFaaliyet = (f: Kayit) => {
    setEditingFaaliyetId(f.id);
    setFaaliyetTarih(normalizeDateKey(f.tarih));
    setFaaliyetGrubu(f.faaliyetGrubu || 'NORMAL');
    setIsNiteligi(f.isNiteligi || isOptions[0]);
    setParsel(f.parsel || PARSEL_LIST[0]);
    setBlok(f.blok || defaultBlokForParsel(f.parsel || PARSEL_LIST[0]));
    setAciklama(f.aciklama || '');
    setFotoUrl(f.fotoUrl || '');
    setPersonelMesaiSaatleri(f.personelMesaiSaatleri || {});
    const of = f as OperatorSahaFaaliyet;
    setTaseronKesintiAcik(Boolean(of.taseronKesinti));
    setTaseronCariId(of.taseronFirmaId || '');
    setMakineKaynak(of.makineKaynak || 'DEMIRBAS');
    setSelectedAracId(of.makineKaynak === 'MANUEL' ? '' : of.aracId || '');
    setMakineManuelAd(of.makineManuelAd || (of.makineKaynak === 'MANUEL' ? of.aracPlaka || '' : ''));
    const tipRaw = String(of.operatorTipi || 'JCB').toLocaleUpperCase('tr-TR');
    if (tipRaw.includes('KATO')) setOperatorTipi('KATO');
    else if (tipRaw.includes('KİRAL') || tipRaw.includes('KIRAL')) setOperatorTipi('KİRALIK');
    else if (tipRaw.includes('DİĞER') || tipRaw.includes('DIGER')) setOperatorTipi('DİĞER');
    else setOperatorTipi('JCB');
    setActiveSubTab('faaliyet');
  };

  const handleSilFaaliyet = async (f: Kayit) => {
    if (!window.confirm('Bu faaliyet silinsin mi?')) return;
    try {
      await deleteDoc(doc(db, collectionName, f.id));
      const bagli = (f as OperatorSahaFaaliyet).bagliOperatorFaaliyetId;
      if (bagli) {
        try {
          await deleteDoc(doc(db, 'operatorFaaliyetleri', bagli));
        } catch {
          /* ignore */
        }
      }
      if (f.faaliyetGrubu === 'MESAI' && f.personelMesaiSaatleri) {
        // Operatörde artık kayıtta da yazılıyor — silince geri al
        await syncMesai(f.tarih, undefined, f.personelMesaiSaatleri);
      }
      if (editingFaaliyetId === f.id) resetFaaliyetForm();
      showStatus('success', 'Faaliyet silindi.');
    } catch (err: any) {
      showStatus('error', 'Silinemedi: ' + (err?.message || ''));
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <div className={`p-2.5 rounded-2xl shrink-0 ${rol === 'SOFOR' ? 'bg-sky-100' : 'bg-amber-100'}`}>
          <TitleIcon className={rol === 'SOFOR' ? 'text-sky-700' : 'text-amber-800'} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide truncate">{title}</h2>
          <p className="text-[10px] text-slate-500 leading-snug">
            Normal / mesai · Faaliyeti Olan · ZER · yoklama
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl border flex items-start gap-2 w-full max-w-full min-w-0 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : statusMessage.type === 'info'
                ? 'bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {statusMessage.type === 'info' ? (
            <RefreshCw size={14} className="animate-spin shrink-0 mt-0.5" />
          ) : (
            <CheckCircle size={14} className="shrink-0 mt-0.5" />
          )}
          <span className="text-xs font-bold break-words min-w-0">{statusMessage.text}</span>
        </div>
      )}

      {showYoklamaTab && (
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
        </div>
      )}

      {(activeSubTab === 'faaliyet' || !showYoklamaTab) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 min-w-0 w-full">
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-3 shadow-sm min-w-0 overflow-hidden">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              {editingFaaliyetId ? 'Faaliyet Düzenle' : 'Yeni Faaliyet'}
            </h3>
            <form onSubmit={handleSaveFaaliyet} className="space-y-3 text-xs min-w-0">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFaaliyetGrubu('NORMAL')}
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg cursor-pointer ${
                    faaliyetGrubu === 'NORMAL' ? 'bg-slate-900 text-white' : 'text-slate-500'
                  }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setFaaliyetGrubu('MESAI')}
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg cursor-pointer ${
                    faaliyetGrubu === 'MESAI' ? 'bg-amber-500 text-slate-900' : 'text-slate-500'
                  }`}
                >
                  Mesaili
                </button>
              </div>

              <label className="block space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase">Tarih</span>
                <input
                  type="date"
                  value={faaliyetTarih}
                  onChange={(e) => setFaaliyetTarih(e.target.value)}
                  className="w-full max-w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold box-border"
                />
              </label>

              <label className="block space-y-1 min-w-0">
                <span className="text-[9px] font-black text-slate-500 uppercase">İş Niteliği</span>
                <select
                  value={isNiteligi}
                  onChange={(e) => setIsNiteligi(e.target.value)}
                  className="w-full max-w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold box-border"
                >
                  {isOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                <label className="block space-y-1 min-w-0">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Parsel *</span>
                  <select
                    required
                    value={parsel}
                    onChange={(e) => {
                      const next = e.target.value;
                      setParsel(next);
                      setBlok(defaultBlokForParsel(next));
                    }}
                    className="w-full max-w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold box-border"
                  >
                    {PARSEL_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 min-w-0">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Blok *</span>
                  <select
                    required
                    value={blok}
                    onChange={(e) => setBlok(e.target.value)}
                    className="w-full max-w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold box-border"
                  >
                    {(blokOptions.length ? blokOptions : ['GENEL SAHA']).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {rol === 'OPERATOR' && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-[9px] font-black text-amber-900 uppercase tracking-wider">
                    İş Makinesi *
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['DEMIRBAS', 'Demirbaş'],
                        ['KIRALIK', 'Kiralık'],
                        ['MANUEL', 'Manuel'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setMakineKaynak(k)}
                        className={`py-1.5 rounded-lg border text-[9px] font-bold cursor-pointer ${
                          makineKaynak === k
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white border-amber-200 text-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {makineKaynak === 'MANUEL' ? (
                    <input
                      value={makineManuelAd}
                      onChange={(e) => setMakineManuelAd(e.target.value)}
                      placeholder="Makine adı / plaka (elle)"
                      className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 font-bold text-[11px]"
                    />
                  ) : (
                    <select
                      value={selectedAracId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedAracId(id);
                        const arac = araclar.find((a) => a.id === id);
                        const mm = `${arac?.markaModel || ''} ${arac?.plaka || ''}`.toLocaleLowerCase(
                          'tr-TR'
                        );
                        if (mm.includes('jcb')) setOperatorTipi('JCB');
                        else if (mm.includes('kato')) setOperatorTipi('KATO');
                      }}
                      className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 font-bold text-[11px]"
                    >
                      <option value="">İş makinesi seçiniz</option>
                      {ismakineAraclari.length === 0 ? (
                        <option value="" disabled>
                          Kayıtlı iş makinesi yok — Manuel deneyin
                        </option>
                      ) : (
                        ismakineAraclari.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.plaka} — {a.markaModel}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['JCB', 'KATO', 'KİRALIK', 'DİĞER'] as const).map((tip) => (
                      <button
                        key={tip}
                        type="button"
                        onClick={() => setOperatorTipi(tip)}
                        className={`py-1.5 rounded-lg border text-[9px] font-bold uppercase cursor-pointer ${
                          operatorTipi === tip
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-white text-slate-500 border-amber-200'
                        }`}
                      >
                        {tip}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-amber-950 leading-snug">{canliMakineEtiketi}</p>
                </div>
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
                <img
                  src={fotoUrl}
                  alt=""
                  className="max-h-36 w-full max-w-full rounded-xl border object-contain bg-slate-50"
                />
              )}

              {faaliyetGrubu === 'MESAI' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black uppercase text-amber-800">
                    Mesai Saatleri {rol === 'OPERATOR' ? '(yalnızca operatör personel)' : ''}
                  </p>
                  {rolPersoneller.length === 0 ? (
                    <p className="text-[10px] text-amber-700 italic">Bu görevde personel bulunamadı.</p>
                  ) : (
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {rolPersoneller.map((p) => {
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

                  {rol === 'OPERATOR' && (
                    <div className="pt-2 border-t border-amber-200 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={taseronKesintiAcik}
                          onChange={(e) => setTaseronKesintiAcik(e.target.checked)}
                          className="rounded border-amber-400"
                        />
                        <span className="text-[10px] font-black text-amber-900 uppercase">
                          Taşeron için mesai — kesinti kaydı oluştur
                        </span>
                      </label>
                      {taseronKesintiAcik && (
                        <select
                          value={taseronCariId}
                          onChange={(e) => setTaseronCariId(e.target.value)}
                          className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 font-bold text-[11px]"
                        >
                          <option value="">Taşeron firma seçin</option>
                          {taseronCariler.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.unvan}
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="text-[9px] text-amber-800/80">
                        Kesinti kaydı Onay Havuzu’na düşer; onaylanınca cari geçmişe ve maddi rapora gider.
                      </p>
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

          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-3 shadow-sm min-w-0 overflow-hidden">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 break-words">
              {formatDateLabelTr(faaliyetTarih)} kayıtları ({gunlukFaaliyetler.length})
            </h3>
            {gunlukFaaliyetler.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">
                Bu tarihte kayıt yok. Kaydettikten sonra burada listelenir; mesaili kayıtta en az bir
                personele saat girilmelidir.
              </p>
            ) : (
              <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                {gunlukFaaliyetler.map((f) => (
                  <div key={f.id} className="border border-slate-150 rounded-xl p-3 space-y-1.5 bg-slate-50/80">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-black text-slate-800">{f.isNiteligi}</p>
                        <p className="text-[9px] text-slate-500 font-bold">
                          {f.parsel} / {f.blok} · {f.faaliyetGrubu === 'MESAI' ? 'MESAİ' : 'NORMAL'}
                          {f.durum === 'ONAY BEKLİYOR' || f.durum === 'BEKLEMEDE'
                            ? ' · Onay bekliyor'
                            : f.durum === 'ONAYLANDI'
                              ? ' · Onaylandı'
                              : f.durum === 'REDDEDİLDİ'
                                ? ' · Reddedildi'
                                : ''}
                          {(f as OperatorSahaFaaliyet).taseronKesinti ? ' · Taşeron kesinti' : ''}
                        </p>
                        {(f as OperatorSahaFaaliyet).isKaydiEtiketi ||
                        (f as OperatorSahaFaaliyet).aracPlaka ? (
                          <p className="text-[9px] font-bold text-amber-800">
                            {(f as OperatorSahaFaaliyet).isKaydiEtiketi ||
                              (f as OperatorSahaFaaliyet).aracPlaka}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditFaaliyet(f)}
                          className="p-1.5 rounded-lg bg-white border text-slate-600 cursor-pointer"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSilFaaliyet(f)}
                          className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-700">{f.aciklama}</p>
                    <p className="text-[9px] text-slate-500">
                      Personel: {(f.aktifPersonelListesi || []).length}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showYoklamaTab && activeSubTab === 'yoklama' && (
        <KampGunlukYoklamaTab
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalar}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          addNotification={addNotification}
          personelKapsami={rol === 'SOFOR' ? 'sofor' : 'operator'}
        />
      )}
    </div>
  );
};
