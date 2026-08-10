import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Package, Plus, Search, Trash2, Pencil, Download,
  ClipboardList, X, RefreshCw, FileText, Truck, Receipt, Home, User, Users, Eye, UserX, Upload, Archive, Printer, GitMerge
} from 'lucide-react';
import { collection, deleteField, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { CariKart, Fatura, Irsaliye, Personel, SatinAlmaTalebi, StokKart, StokKartIslem, CariKartIslem } from '../types/erp';
import { db, removeDocument } from '../lib/firebase';
import { warnIfDuplicateCari, warnIfDuplicateStok } from '../lib/duplicateNameUtils';
import { exportHistoryReport } from '../lib/reportExport';
import { firmaEslesir, personelForCariKart } from '../lib/taseronUtils';
import { findDuplicateCariler, mergeDuplicateCarilerFor } from '../lib/cariKartDedupUtils';
import { displayPersonelGorev, isPersonelActiveOnDate } from '../lib/guvenlikHelpers';
import { formatDateLabelTr, normalizeDateKey, todayDateKey } from '../lib/dateKeyUtils';
import { EvrakDetayModal, EvrakDetayPayload } from './EvrakDetayModal';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import { CariTimeline } from './CariTimeline';
import {
  applyCariStokExcelImport,
  applyBirbesanFaturaPlans,
  ensureBirbesanCari,
  isBirbesanStokArsiv,
  mergeExcelLinesByStokName,
  normalizeImportText,
  parseCariStokExcelFiles,
} from '../lib/cariStokExcelImport';
import birbesanFaturalarData from '../../data/birbesan/birbesan-faturalar.json';
import {
  printCariStokTopluYazdir,
  stokIslemleriForCariStoklar,
  stoklarForCariKart,
} from '../lib/cariStokTopluYazdir';
import {
  assertSameCariIrsaliyeler,
  buildFaturaFromIrsaliyeler,
  irsaliyeHizmetMiktari,
  isTaslakMaliBagFatura,
  linkIrsaliyelerToFatura,
} from '../lib/evrakDonusum';
import { appendCariIslemOnce, buildCariEvrakHistory } from '../lib/evrakCariStokSync';
import { openEvrakZincirRaporu } from '../lib/evrakZincirRapor';
import {
  applySekerVidanjorFaturaResetInMemory,
  planSekerVidanjorFaturaReset,
} from '../lib/sekerVidanjorFaturaReset';
import { isSekerVidanjorFirma } from '../lib/vidanjorUtils';

interface CariStokScreenProps {
  cariKartlar: CariKart[];
  setCariKartlar: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar: React.Dispatch<React.SetStateAction<StokKart[]>>;
  stokIslemGecmisi?: StokKartIslem[];
  setStokIslemGecmisi?: React.Dispatch<React.SetStateAction<StokKartIslem[]>>;
  faturalar?: Fatura[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  irsaliyeler?: Irsaliye[];
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  cariIslemGecmisi?: CariKartIslem[];
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  personeller?: Personel[];
  setPersoneller?: React.Dispatch<React.SetStateAction<Personel[]>>;
}

type HistoryCollection =
  | 'satinAlmaTalepleri'
  | 'irsaliyeler'
  | 'faturalar'
  | 'kampKayitlari'
  | 'personelZimmetleri'
  | 'cariIslemGecmisi'
  | 'hazirTutanaklar';

type HistoryLogKalem = {
  urunAdi: string;
  miktar?: number | string;
  birim?: string;
  birimFiyat?: number;
  toplam?: number;
};

type HistoryLog = {
  id: string;
  type: string;
  title: string;
  desc: string;
  date: string;
  badgeColor: string;
  collection?: HistoryCollection;
  kalemler?: HistoryLogKalem[];
  /** Aylık gruplama için YYYY-MM */
  monthKey?: string;
  hizmetMiktar?: number;
  hizmetEtiket?: string;
};

type GenericDetail = {
  title: string;
  rows: { label: string; value: string }[];
  attachmentUrl?: string;
  attachmentName?: string;
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  'KART AÇILIŞI': <Building2 size={14} />,
  'SATIN ALMA': <ClipboardList size={14} />,
  'İRSALİYE': <Truck size={14} />,
  'İRSALİYE GİRİŞİ': <Truck size={14} />,
  'FATURA': <Receipt size={14} />,
  'TASLAK BAĞ': <Receipt size={14} />,
  'LOJMAN KONAKLAMA': <Home size={14} />,
  'PERSONEL ZİMMET': <User size={14} />,
  'PERSONEL': <Users size={14} />,
  'TAŞERON PERSONEL': <Users size={14} />,
  'MALZEME TESLİM': <Package size={14} />,
};

export const CariStokScreen: React.FC<CariStokScreenProps> = ({
  cariKartlar,
  setCariKartlar,
  stokKartlar,
  setStokKartlar,
  stokIslemGecmisi = [],
  setStokIslemGecmisi,
  faturalar = [],
  setFaturalar,
  irsaliyeler = [],
  setIrsaliyeler,
  satinAlmaTalepleri = [],
  cariIslemGecmisi = [],
  setCariIslemGecmisi,
  personeller = [],
  setPersoneller,
}) => {
  const [csTab, setCsTab] = useState<'cari' | 'stok'>('cari');
  const [cariSearchQuery, setCariSearchQuery] = useState('');
  const [stokSearchQuery, setStokSearchQuery] = useState('');
  const [selectedCariId, setSelectedCariId] = useState<string | null>(null);
  const [selectedStokId, setSelectedStokId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingCari, setDeletingCari] = useState(false);
  const [mergingCari, setMergingCari] = useState(false);
  const [deletingStok, setDeletingStok] = useState(false);
  const [dismissingPersonel, setDismissingPersonel] = useState<Personel | null>(null);
  const [dismissDateStr, setDismissDateStr] = useState(() => todayDateKey());

  const [newCariUnvan, setNewCariUnvan] = useState('');
  const [newCariType, setNewCariType] = useState<CariKart['kartTipi']>('TEDARIKCI');
  const [newCariYetkili, setNewCariYetkili] = useState('');
  const [newCariTelefon, setNewCariTelefon] = useState('');
  const [newCariEposta, setNewCariEposta] = useState('');
  const [newCariVergiNo, setNewCariVergiNo] = useState('');
  const [newCariVergiDairesi, setNewCariVergiDairesi] = useState('');
  const [newCariAdres, setNewCariAdres] = useState('');
  const [newCariIban, setNewCariIban] = useState('');
  const [newCariNotlar, setNewCariNotlar] = useState('');
  const [editingCariId, setEditingCariId] = useState<string | null>(null);

  const [newStokAdi, setNewStokAdi] = useState('');
  const [newStokBirim, setNewStokBirim] = useState('TON');
  const [newStokKategori, setNewStokKategori] = useState('Kaba İnşaat İmalatı');
  const [newStokAciklama, setNewStokAciklama] = useState('');
  const [editingStokId, setEditingStokId] = useState<string | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryLog[]>([]);
  const [historyFilter, setHistoryFilter] = useState('ALL');
  const [selectedIrsaliyeIds, setSelectedIrsaliyeIds] = useState<Set<string>>(new Set());
  const [detayPayload, setDetayPayload] = useState<EvrakDetayPayload | null>(null);
  const [genericDetail, setGenericDetail] = useState<GenericDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const birbesanExcelInputRef = useRef<HTMLInputElement>(null);
  const [stokListeTab, setStokListeTab] = useState<'AKTIF' | 'ARSIV'>('AKTIF');

  const filteredCariKartlar = useMemo(() => {
    const q = cariSearchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return cariKartlar;
    return cariKartlar.filter(
      (cr) =>
        String(cr.unvan || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(cr.kod || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(cr.kartTipi || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(cr.iban || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [cariKartlar, cariSearchQuery]);

  const stokTabCounts = useMemo(
    () => ({
      aktif: stokKartlar.filter((s) => !s.arsivde).length,
      arsiv: stokKartlar.filter((s) => s.arsivde).length,
      birbesan: stokKartlar.filter((s) => isBirbesanStokArsiv(s)).length,
    }),
    [stokKartlar]
  );

  const stokPoolForTab = useMemo(() => {
    if (stokListeTab === 'ARSIV') return stokKartlar.filter((s) => s.arsivde);
    return stokKartlar.filter((s) => !s.arsivde);
  }, [stokKartlar, stokListeTab]);

  const filteredStokKartlar = useMemo(() => {
    const q = stokSearchQuery.trim().toLowerCase();
    const pool = stokPoolForTab;
    if (!q) return pool;
    return pool.filter(
      (st) =>
        String(st.stokAdi || '').toLowerCase().includes(q) ||
        String(st.stokKodu || '').toLowerCase().includes(q) ||
        String(st.kategori || '').toLowerCase().includes(q) ||
        String(st.birim || '').toLowerCase().includes(q) ||
        String(st.tedarikciUnvan || '').toLowerCase().includes(q)
    );
  }, [stokPoolForTab, stokSearchQuery]);

  const selectedCari = useMemo(
    () => cariKartlar.find((c) => c.id === selectedCariId) || null,
    [cariKartlar, selectedCariId]
  );
  const selectedStok = useMemo(
    () => stokKartlar.find((s) => s.id === selectedStokId) || null,
    [stokKartlar, selectedStokId]
  );

  const bagliPersoneller = useMemo(() => {
    if (!selectedCari) return [];
    return personelForCariKart(personeller, selectedCari);
  }, [personeller, selectedCari]);

  const cariBagliStoklar = useMemo(() => {
    if (!selectedCari) return [];
    return stoklarForCariKart(selectedCari, stokKartlar);
  }, [selectedCari, stokKartlar]);

  const cariBagliStokIslemleri = useMemo(
    () => stokIslemleriForCariStoklar(cariBagliStoklar, stokIslemGecmisi),
    [cariBagliStoklar, stokIslemGecmisi]
  );

  const bugun = todayDateKey();
  const bagliPersonelAktifSayisi = useMemo(
    () => bagliPersoneller.filter((p) => isPersonelActiveOnDate(p, bugun)).length,
    [bagliPersoneller, bugun]
  );

  useEffect(() => {
    if (csTab === 'cari' && !selectedCariId && filteredCariKartlar[0]) {
      setSelectedCariId(filteredCariKartlar[0].id);
    }
    if (csTab === 'stok') {
      const visible = filteredStokKartlar;
      if (!visible.some((s) => s.id === selectedStokId)) {
        setSelectedStokId(visible[0]?.id || null);
      }
    }
  }, [csTab, filteredCariKartlar, filteredStokKartlar, selectedCariId, selectedStokId, stokListeTab]);

  const loadHistoryData = async (type: 'cari' | 'stok', id: string, name: string, code: string) => {
    setHistoryLoading(true);
    setHistoryList([]);
    // Cari kartta varsayılan: Geçmiş İrsaliyeler (seçip faturaya dönüştürme akışı)
    setHistoryFilter(type === 'cari' ? 'İRSALİYE' : 'ALL');
    setSelectedIrsaliyeIds(new Set());
    try {
      const logs: HistoryLog[] = [];
      // Belge kalemlerini rapora taşımak için normalize eder
      const mapKalemler = (kalemler: any): HistoryLogKalem[] | undefined => {
        if (!Array.isArray(kalemler) || kalemler.length === 0) return undefined;
        return kalemler.map((k: any) => ({
          urunAdi: k.urunAdi || k.malzemeAdi || k.stokAdi || '-',
          miktar: k.miktar,
          birim: k.birim || k.cinsi,
          birimFiyat: k.birimFiyat != null ? Number(k.birimFiyat) : undefined,
          toplam: k.toplam != null ? Number(k.toplam) : undefined,
        }));
      };
      logs.push({
        id: 'init',
        type: 'KART AÇILIŞI',
        title: 'Kart Tanımlama ve Açılış Kaydı',
        desc: `"${name}" (${code || 'KODSUZ'}) kartı sisteme tanımlandı.`,
        date: 'İlk Kayıt',
        badgeColor: 'bg-emerald-100 text-emerald-800',
      });

      if (type === 'cari') {
        const purchasesSnap = await getDocs(collection(db, 'satinAlmaTalepleri'));
        purchasesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (firmaEslesir(String(data.cariFirma || ''), name) || Boolean(data.cariKartId && data.cariKartId === id)) {
            logs.push({
              id: docSnap.id,
              type: 'SATIN ALMA',
              title: `Satın Alma Talebi: ${data.saId || 'SA-KOD'}`,
              desc: `${data.aciklama || 'Açıklama yok'} (${data.kalemler?.length || 0} kalem). Onay: ${data.onayDurumu}`,
              date: data.tarih || '',
              badgeColor: 'bg-slate-100 text-slate-800',
              collection: 'satinAlmaTalepleri',
              kalemler: mapKalemler(data.kalemler),
            });
          }
        });

        const waybillsSnap = await getDocs(collection(db, 'irsaliyeler'));
        waybillsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const firmaMatch = firmaEslesir(String(data.firma || ''), name);
          const cariIdMatch = Boolean(data.cariKartId && data.cariKartId === id);
          if (firmaMatch || cariIdMatch) {
            const tarihKey = normalizeDateKey(data.tarih) || String(data.tarih || '');
            const hizmet = irsaliyeHizmetMiktari(data as Irsaliye);
            logs.push({
              id: docSnap.id,
              type: 'İRSALİYE',
              title: `İrsaliye: ${data.irsaliyeNo || 'İRS-KOD'}`,
              desc: `Durum: ${data.onayDurumu}${data.kaynak ? ` · Kaynak: ${data.kaynak}` : ''}${
                data.plaka ? ` · ${data.plaka}` : ''
              }${hizmet.miktar > 0 ? ` · ${hizmet.miktar} ${hizmet.etiket}` : ''}${
                Array.isArray(data.kalemler) && data.kalemler.length ? ` · ${data.kalemler.length} kalem` : ''
              }${data.toplamTutar ? ` · ₺${Number(data.toplamTutar).toLocaleString('tr-TR')}` : ''}`,
              date: tarihKey,
              badgeColor: 'bg-amber-100 text-amber-800',
              collection: 'irsaliyeler',
              kalemler: mapKalemler(data.kalemler),
              monthKey: tarihKey ? tarihKey.slice(0, 7) : undefined,
              hizmetMiktar: hizmet.miktar,
              hizmetEtiket: hizmet.etiket,
            });
          }
        });

        const invoicesSnap = await getDocs(collection(db, 'faturalar'));
        invoicesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (firmaEslesir(String(data.cariUnvan || ''), name) || Boolean(data.cariKartId && data.cariKartId === id)) {
            const taslak = isTaslakMaliBagFatura(data as Fatura);
            const tarihKey = normalizeDateKey(data.tarih) || String(data.tarih || '');
            const bagliSayisi = Array.isArray(data.bagliIrsaliyeler) ? data.bagliIrsaliyeler.length : 0;
            logs.push({
              id: docSnap.id,
              type: taslak ? 'TASLAK BAĞ' : 'FATURA',
              title: taslak
                ? `Taslak bağ (fatura değil): ${data.faturaNo || 'FAT-KOD'}`
                : `Fatura: ${data.faturaNo || 'FAT-KOD'}`,
              desc: taslak
                ? `${bagliSayisi} irsaliye · matrah ₺0 · gerçek fatura girişi bekleniyor · ${data.durum || ''}`
                : `Matrah: ₺${Number(data.toplamTutar || data.genelToplam || 0).toLocaleString('tr-TR')} · ${data.durum}`,
              date: tarihKey,
              badgeColor: taslak ? 'bg-slate-100 text-slate-700' : 'bg-stone-200 text-stone-800',
              collection: 'faturalar',
              kalemler: mapKalemler(data.kalemler),
              monthKey: tarihKey ? tarihKey.slice(0, 7) : undefined,
            });
          }
        });

        const staysSnap = await getDocs(collection(db, 'kampKayitlari'));
        staysSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (firmaEslesir(String(data.calistigiFirma || ''), name)) {
            logs.push({
              id: docSnap.id,
              type: 'LOJMAN KONAKLAMA',
              title: `Konaklama: ${data.personelIsim}`,
              desc: `${data.girisTarihi} · ${data.durum === 'AKTIF' ? 'Hâlâ konaklıyor' : 'Ayrıldı'}`,
              date: data.girisTarihi || '',
              badgeColor: 'bg-teal-100 text-teal-800',
              collection: 'kampKayitlari',
            });
          }
        });

        // Cari işlem geçmişi (SA / irsaliye / fatura / personel / teslim)
        const cariIslemSnap = await getDocs(collection(db, 'cariIslemGecmisi'));
        cariIslemSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.cariKartId !== id) return;
          const tip = String(data.islemTipi || '').toUpperCase();
          const baslik = String(data.islemBaslik || '').toLocaleLowerCase('tr-TR');
          const detay = String(data.islemDetay || '').toLocaleLowerCase('tr-TR');
          const isPersonelIslem = baslik.includes('personel') || detay.includes('personel');
          const isMalzemeTeslim =
            baslik.includes('malzeme teslim') || baslik.includes('teslim tutanağı');
          const isEvrak =
            tip === 'SATIN_ALMA' ||
            tip === 'IRSALIYE' ||
            tip === 'FATURA' ||
            tip === 'KASA_HAREKETI';
          const isOperatorKesinti = tip === 'OPERATOR_KESINTI';

          if (!isPersonelIslem && !isMalzemeTeslim && !isEvrak && !isOperatorKesinti) return;

          const typeLabel = isMalzemeTeslim
            ? 'MALZEME TESLİM'
            : isOperatorKesinti
              ? 'İŞ MAKİNESİ KESİNTİ'
              : isPersonelIslem
              ? 'TAŞERON PERSONEL'
              : tip === 'SATIN_ALMA'
                ? 'SATIN ALMA (İŞLEM)'
                : tip === 'IRSALIYE'
                  ? 'İRSALİYE (İŞLEM)'
                  : tip === 'FATURA'
                    ? 'FATURA (İŞLEM)'
                    : 'CARİ İŞLEM';

          logs.push({
            id: isMalzemeTeslim && data.islemId ? String(data.islemId) : docSnap.id,
            type: typeLabel,
            title: data.islemBaslik || typeLabel,
            desc: data.islemDetay || '',
            date: data.tarih || '',
            badgeColor: isMalzemeTeslim
              ? 'bg-emerald-100 text-emerald-800'
              : isOperatorKesinti
                ? 'bg-amber-100 text-amber-900'
              : isEvrak
                ? 'bg-blue-100 text-blue-800'
                : 'bg-indigo-100 text-indigo-800',
            collection: isMalzemeTeslim ? 'hazirTutanaklar' : 'cariIslemGecmisi',
          });
        });

        // Doğrudan tutanak koleksiyonundan (cariKartId / taseron unvan eşleşmesi)
        const tutanakSnap = await getDocs(collection(db, 'hazirTutanaklar'));
        tutanakSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.tutanakTipi !== 'TESLİM') return;
          const idMatch = data.cariKartId === id;
          const nameMatch = firmaEslesir(String(data.taseronAdi || ''), name);
          if (!idMatch && !nameMatch) return;
          if (logs.some((l) => l.collection === 'hazirTutanaklar' && l.id === docSnap.id)) return;
          const kalemSayisi = Array.isArray(data.kalemler) ? data.kalemler.length : 0;
          logs.push({
            id: docSnap.id,
            type: 'MALZEME TESLİM',
            title: `Teslim: ${data.belgeNo || docSnap.id}`,
            desc: `${data.konu || 'Malzeme Teslim'} · ${kalemSayisi} kalem · ${data.durum || ''}`,
            date: data.tarih || '',
            badgeColor: 'bg-emerald-100 text-emerald-800',
            collection: 'hazirTutanaklar',
          });
        });
      } else {
        // Bu stok kartına ait kalemin miktar × birim fiyat bilgisini üretir
        const kalemFiyatStr = (kalemler: any): string => {
          if (!Array.isArray(kalemler)) return '';
          const k = kalemler.find(
            (x: any) => x.stokKartId === id || String(x.urunAdi || '').toLowerCase() === name.toLowerCase()
          );
          if (!k) return '';
          const bf = Number(k.birimFiyat || 0);
          const base = `${k.miktar ?? ''} ${k.birim || ''}`.trim();
          return base + (bf ? ` × ₺${bf.toLocaleString('tr-TR')}` : '');
        };
        const purchasesSnap = await getDocs(collection(db, 'satinAlmaTalepleri'));
        purchasesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const hasItem = data.kalemler?.some(
            (k: any) => k.urunAdi?.toLowerCase() === name.toLowerCase() || k.stokKartId === id
          );
          if (hasItem) {
            const kf = kalemFiyatStr(data.kalemler);
            logs.push({
              id: docSnap.id,
              type: 'SATIN ALMA',
              title: `Satın Alma: ${data.saId || 'SA-KOD'}`,
              desc: `Firma: ${data.cariFirma}${kf ? ` · ${kf}` : ''}`,
              date: data.tarih || '',
              badgeColor: 'bg-slate-100 text-slate-800',
              collection: 'satinAlmaTalepleri',
            });
          }
        });

        const waybillsSnap = await getDocs(collection(db, 'irsaliyeler'));
        waybillsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const hasItem = data.kalemler?.some(
            (k: any) => k.urunAdi?.toLowerCase() === name.toLowerCase() || k.stokKartId === id
          );
          if (hasItem) {
            logs.push({
              id: docSnap.id,
              type: 'İRSALİYE GİRİŞİ',
              title: `Depo girişi: ${data.irsaliyeNo || 'İRS-KOD'}`,
              desc: `Firma: ${data.firma}${kalemFiyatStr(data.kalemler) ? ` · ${kalemFiyatStr(data.kalemler)}` : ''}`,
              date: data.tarih || '',
              badgeColor: 'bg-amber-100 text-amber-800',
              collection: 'irsaliyeler',
            });
          }
        });

        const invoicesSnap = await getDocs(collection(db, 'faturalar'));
        invoicesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const hasItem = data.kalemler?.some(
            (k: any) => k.urunAdi?.toLowerCase() === name.toLowerCase() || k.stokKartId === id
          );
          if (hasItem) {
            logs.push({
              id: docSnap.id,
              type: 'FATURA',
              title: `Fatura: ${data.faturaNo || 'FAT-KOD'}`,
              desc: `Firma: ${data.cariUnvan || '-'}${kalemFiyatStr(data.kalemler) ? ` · ${kalemFiyatStr(data.kalemler)}` : ''} · ₺${Number(data.genelToplam || 0).toLocaleString('tr-TR')}`,
              date: data.tarih || '',
              badgeColor: 'bg-stone-200 text-stone-800',
              collection: 'faturalar',
            });
          }
        });

        const zimmetsSnap = await getDocs(collection(db, 'personelZimmetleri'));
        zimmetsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.stockId === id || data.urunAdi?.toLowerCase() === name.toLowerCase()) {
            logs.push({
              id: docSnap.id,
              type: 'PERSONEL ZİMMET',
              title: `Zimmet: ${data.personelIsim || data.personelName || 'Personel'}`,
              desc: `${data.miktar} ${data.birim} · ${data.durum || 'ZİMMETLİ'}`,
              date: data.tarih || '',
              badgeColor: 'bg-indigo-100 text-indigo-800',
              collection: 'personelZimmetleri',
            });
          }
        });
      }

      logs.sort((a, b) => {
        if (a.date === 'İlk Kayıt') return 1;
        if (b.date === 'İlk Kayıt') return -1;
        return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      });
      setHistoryList(logs);
    } catch (e) {
      console.error('Geçmiş veri okuma hatası:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (csTab === 'cari' && selectedCari) {
      void loadHistoryData('cari', selectedCari.id, selectedCari.unvan, selectedCari.kod);
    } else if (csTab === 'stok' && selectedStok) {
      void loadHistoryData('stok', selectedStok.id, selectedStok.stokAdi, selectedStok.stokKodu);
    } else {
      setHistoryList([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csTab, selectedCariId, selectedStokId]);

  const openHistoryDetay = async (log: HistoryLog) => {
    if (!log.collection || log.id === 'init') return;
    setDetailLoadingId(log.id);
    try {
      const snap = await getDoc(doc(db, log.collection, log.id));
      if (!snap.exists()) {
        alert('Evrak kaydı bulunamadı.');
        return;
      }
      const data = { id: snap.id, ...snap.data() } as Record<string, unknown>;

      if (log.collection === 'satinAlmaTalepleri') {
        setDetayPayload({ kind: 'sa', sa: data as unknown as SatinAlmaTalebi });
        return;
      }
      if (log.collection === 'irsaliyeler') {
        setDetayPayload({ kind: 'irsaliye', irsaliye: data as unknown as Irsaliye });
        return;
      }
      if (log.collection === 'faturalar') {
        setDetayPayload({ kind: 'fatura', fatura: data as unknown as Fatura });
        return;
      }
      if (log.collection === 'kampKayitlari') {
        setGenericDetail({
          title: `Konaklama · ${data.personelIsim || 'Personel'}`,
          rows: [
            { label: 'Personel', value: String(data.personelIsim || '—') },
            { label: 'Firma', value: String(data.calistigiFirma || '—') },
            { label: 'Yerleşke', value: String(data.yerleskeAdi || '—') },
            { label: 'Kat / Oda', value: `${data.katAdi || '—'} / ${data.odaNo || '—'}` },
            { label: 'Giriş', value: String(data.girisTarihi || '—') },
            { label: 'Çıkış', value: String(data.cikisTarihi || '—') },
            { label: 'Durum', value: String(data.durum || '—') },
          ],
        });
        return;
      }
      if (log.collection === 'personelZimmetleri') {
        setGenericDetail({
          title: `Zimmet · ${data.personelIsim || data.personelName || 'Personel'}`,
          rows: [
            { label: 'Personel', value: String(data.personelIsim || data.personelName || '—') },
            { label: 'Ürün', value: String(data.urunAdi || '—') },
            { label: 'Kod', value: String(data.kod || '—') },
            { label: 'Miktar', value: `${data.miktar ?? '—'} ${data.birim || ''}`.trim() },
            { label: 'Teslim eden', value: String(data.teslimEden || '—') },
            { label: 'Tarih', value: String(data.tarih || '—') },
            { label: 'İade', value: String(data.iadeTarihi || '—') },
            { label: 'Durum', value: String(data.durum || '—') },
            { label: 'Açıklama', value: String(data.aciklama || '—') },
          ],
        });
        return;
      }
      if (log.collection === 'cariIslemGecmisi') {
        setGenericDetail({
          title: String(data.islemBaslik || 'Cari işlem'),
          rows: [
            { label: 'İşlem', value: String(data.islemBaslik || '—') },
            { label: 'Detay', value: String(data.islemDetay || '—') },
            { label: 'Tip', value: String(data.islemTipi || '—') },
            { label: 'Belge No', value: String(data.belgeNo || '—') },
            { label: 'Tarih', value: String(data.tarih || '—') },
            {
              label: 'Tutar',
              value:
                data.tutar != null
                  ? `₺${Number(data.tutar).toLocaleString('tr-TR')}`
                  : '—',
            },
          ],
        });
        return;
      }
      if (log.collection === 'hazirTutanaklar') {
        const kalemler = Array.isArray(data.kalemler) ? data.kalemler : [];
        const kalemOzet = kalemler
          .map(
            (k: any, i: number) =>
              `${i + 1}) ${k.malzemeAdi || '—'} · ${k.miktar ?? '—'} ${k.cinsi || ''} ${k.aciklama ? `· ${k.aciklama}` : ''}`
          )
          .join('\n');
        setGenericDetail({
          title: `Malzeme Teslim · ${data.belgeNo || data.id}`,
          rows: [
            { label: 'Belge No', value: String(data.belgeNo || '—') },
            { label: 'Tarih', value: String(data.tarih || '—') },
            { label: 'Konu', value: String(data.konu || '—') },
            { label: 'Taşeron', value: String(data.taseronAdi || '—') },
            { label: 'Muhatap', value: String(data.muhatapPersonel || '—') },
            { label: 'Teslim Eden', value: String(data.teslimEden || '—') },
            { label: 'Teslim Alan', value: String(data.teslimAlan || '—') },
            { label: 'Durum', value: String(data.durum || '—') },
            { label: 'Kalemler', value: kalemOzet || '—' },
            { label: 'Not', value: String(data.icerik || '—') },
          ],
          attachmentUrl: data.imzaliEvrakUrl ? String(data.imzaliEvrakUrl) : undefined,
          attachmentName: `teslim_${data.belgeNo || 'tutanak'}.jpg`,
        });
      }
    } catch (err) {
      console.error(err);
      alert('Evrak detayı açılamadı.');
    } finally {
      setDetailLoadingId(null);
    }
  };

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'ALL') return historyList;
    return historyList.filter((h) => h.type === historyFilter);
  }, [historyList, historyFilter]);

  const historyByMonth = useMemo(() => {
    const AY = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const map = new Map<string, HistoryLog[]>();
    for (const h of filteredHistory) {
      const mk =
        h.monthKey ||
        (normalizeDateKey(h.date) ? normalizeDateKey(h.date).slice(0, 7) : '') ||
        '0000-00';
      if (!map.has(mk)) map.set(mk, []);
      map.get(mk)!.push(h);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mk, items]) => {
        const [y, m] = mk.split('-');
        const label =
          mk === '0000-00' || !y || !m
            ? 'Tarihsiz'
            : `${AY[Number(m)] || m} ${y}`;
        const hizmetToplam = items.reduce((s, it) => s + (Number(it.hizmetMiktar) || 0), 0);
        const etiket = items.find((it) => it.hizmetEtiket)?.hizmetEtiket || 'çekim';
        return { monthKey: mk, label, items, hizmetToplam, etiket };
      });
  }, [filteredHistory]);

  const historyTypeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of historyList) map[h.type] = (map[h.type] || 0) + 1;
    return map;
  }, [historyList]);

  const toggleIrsaliyeSelection = (id: string) => {
    setSelectedIrsaliyeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBagSelectedIrsaliyelerToFatura = () => {
    if (!setFaturalar || !setIrsaliyeler) {
      alert('Fatura / irsaliye kaydı için sistem bağlantısı yok.');
      return;
    }
    const selected = irsaliyeler.filter((ir) => selectedIrsaliyeIds.has(ir.id));
    const withKalem = selected.filter((ir) => (ir.kalemler || []).length > 0);
    if (!withKalem.length) {
      alert('Seçili irsaliyelerde faturalanacak kalem yok.');
      return;
    }
    const sameCari = assertSameCariIrsaliyeler(withKalem);
    if (!sameCari.ok) {
      alert(sameCari.message);
      return;
    }

    const { fatura, alreadyExists, warning } = buildFaturaFromIrsaliyeler(withKalem, {
      faturalar,
      cariKartlar,
      stokKartlar,
    });

    const nos = withKalem.map((ir) => ir.irsaliyeNo).join(', ');
    if (alreadyExists.length > 0) {
      const ok = window.confirm(
        `${warning || 'Seçili irsaliyeler için fatura bağı zaten var.'}\n\nMevcut: ${alreadyExists
          .map((x) => x.faturaNo)
          .join(', ')}\n\nYine de yeni taslak fatura oluşturulsun mu?\n(Evraklar kilitlenmez; bağ sonradan düzeltilebilir.)`
      );
      if (!ok) return;
    } else if (
      !window.confirm(
        `${withKalem.length} irsaliye tek taslak faturaya dönüştürülsün mü?\n\n${nos}\n\nNot: Birim fiyatlar 0 gelebilir — Fatura sekmesinde düzenleyin.\nEvraklar kilitlenmez; bağ çıkarılabilir.`
      )
    ) {
      return;
    }

    setFaturalar((prev) => [fatura, ...prev]);
    setIrsaliyeler((prev) => linkIrsaliyelerToFatura(prev, fatura));

    if (fatura.cariKartId) {
      appendCariIslemOnce(
        setCariIslemGecmisi,
        buildCariEvrakHistory({
          cariKartId: fatura.cariKartId,
          islemTipi: 'FATURA',
          islemId: fatura.id,
          islemBaslik: 'İrsaliyelerden Taslak Fatura',
          islemDetay: `${withKalem.length} irsaliye → ${fatura.faturaNo} · ${fatura.cariUnvan}`,
          tarih: fatura.tarih,
          belgeNo: fatura.faturaNo,
          tutar: fatura.genelToplam,
        })
      );
    }

    setSelectedIrsaliyeIds(new Set());
    const openRapor = window.confirm(
      `Taslak fatura oluşturuldu.\nNo: ${fatura.faturaNo}\nBirleştirilen irsaliye: ${withKalem.length}\n\nEvraklar düzenlenebilir kaldı.\n\nZincir raporunu açmak ister misiniz?`
    );
    if (openRapor) {
      const saId = fatura.saId || withKalem.find((ir) => ir.saId)?.saId;
      const sa = saId ? satinAlmaTalepleri.find((s) => s.saId === saId) : undefined;
      openEvrakZincirRaporu({
        sa,
        irsaliyeler,
        faturalar: [fatura, ...faturalar],
        focusIrsaliyeIds: withKalem.map((ir) => ir.id),
      });
    }
  };

  const handleResetSekerVidanjorFaturaBaglari = async () => {
    if (!selectedCari || !setFaturalar || !setIrsaliyeler) {
      alert('Cari / fatura bağlantısı yok.');
      return;
    }
    if (!isSekerVidanjorFirma(selectedCari.unvan)) {
      alert('Bu işlem yalnızca Şeker Vidanjör cari kartı için.');
      return;
    }
    const plan = planSekerVidanjorFaturaReset({
      cariKartlar,
      irsaliyeler,
      faturalar,
      cariIslemGecmisi,
      cariKartId: selectedCari.id,
    });
    if (plan.linkedIrsaliyeler.length === 0 && plan.faturalarToDelete.length === 0) {
      alert(
        `Sıfırlanacak fatura bağı yok.\n\n${plan.ozet}\n\nİrsaliyeler zaten faturasız görünüyor; mutabakata geçebilirsiniz.`
      );
      return;
    }
    const ok = window.confirm(
      `Şeker Vidanjör fatura bağları sıfırlansın mı?\n\n${plan.ozet}\n\n• Bağlı irsaliyelerin faturaNo temizlenir\n• Taslak/bağlı faturalar silinir\n• Cari geçmişteki ilgili FATURA işlemleri silinir\n\nSonra irsaliyeleri seçip gerçek mutabakat faturasını oluşturabilirsiniz.`
    );
    if (!ok) return;
    try {
      for (const ir of plan.linkedIrsaliyeler) {
        await updateDoc(doc(db, 'irsaliyeler', ir.id), { faturaNo: deleteField() });
      }
      for (const ft of plan.faturalarToDelete) {
        await removeDocument('faturalar', ft.id);
      }
      for (const id of plan.cariIslemIdsToDelete) {
        await removeDocument('cariIslemGecmisi', id);
      }
      const next = applySekerVidanjorFaturaResetInMemory({
        irsaliyeler,
        faturalar,
        cariIslemGecmisi,
        plan,
      });
      setIrsaliyeler(next.irsaliyeler);
      setFaturalar(next.faturalar);
      if (setCariIslemGecmisi) setCariIslemGecmisi(next.cariIslemGecmisi);
      setSelectedIrsaliyeIds(new Set());
      setHistoryFilter('İRSALİYE');
      alert(
        `Sıfırlandı.\n\n${plan.linkedIrsaliyeler.length} irsaliye faturasız\n${plan.faturalarToDelete.length} fatura silindi\n${plan.cariIslemIdsToDelete.length} cari işlem silindi\n\nŞimdi İRSALİYE sekmesinden mutabakat yapabilirsiniz.`
      );
    } catch (err: any) {
      console.error(err);
      alert('Sıfırlama başarısız: ' + (err?.message || err));
    }
  };

  const handleOpenZincirRaporuFromCari = () => {
    const selected = irsaliyeler.filter((ir) => selectedIrsaliyeIds.has(ir.id));
    const focusIds = selected.length
      ? selected.map((ir) => ir.id)
      : historyList
          .filter((h) => h.collection === 'irsaliyeler')
          .map((h) => h.id);
    const saId =
      selected.find((ir) => ir.saId)?.saId ||
      irsaliyeler.find((ir) => focusIds.includes(ir.id) && ir.saId)?.saId;
    let sa = saId ? satinAlmaTalepleri.find((s) => s.saId === saId) : undefined;
    if (!sa && selectedCariId) {
      const cariSa = satinAlmaTalepleri
        .filter(
          (s) =>
            s.cariKartId === selectedCariId ||
            firmaEslesir(s.cariFirma || '', selectedCari?.unvan || '')
        )
        .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
      sa = cariSa[0];
    }
    if (!sa && !focusIds.length) {
      alert('Zincir raporu için bir satın alma veya irsaliye bulunamadı.');
      return;
    }
    openEvrakZincirRaporu({
      sa,
      irsaliyeler,
      faturalar,
      focusIrsaliyeIds: focusIds.length ? focusIds : undefined,
    });
  };

  const resetCariForm = () => {
    setEditingCariId(null);
    setNewCariUnvan('');
    setNewCariYetkili('');
    setNewCariTelefon('');
    setNewCariEposta('');
    setNewCariVergiNo('');
    setNewCariVergiDairesi('');
    setNewCariAdres('');
    setNewCariIban('');
    setNewCariNotlar('');
    setNewCariType('TEDARIKCI');
  };

  const resetStokForm = () => {
    setEditingStokId(null);
    setNewStokAdi('');
    setNewStokAciklama('');
    setNewStokBirim('TON');
    setNewStokKategori('Kaba İnşaat İmalatı');
  };

  const selectedCariDuplicates = useMemo(() => {
    if (!selectedCari) return [];
    return findDuplicateCariler(selectedCari, cariKartlar);
  }, [selectedCari, cariKartlar]);

  const handleMergeCari = async (cari: CariKart) => {
    const dupes = findDuplicateCariler(cari, cariKartlar);
    if (dupes.length === 0) return;

    const dupKodlar = dupes.map((d) => d.kod || d.id).join(', ');
    if (
      !window.confirm(
        `"${cari.unvan}" için ${dupes.length} mükerrer kart bulundu (${dupKodlar}).\n\nBirleştirme: en uygun kart korunur, diğerleri silinir. Personel kayıtları firma adıyla eşleşmeye devam eder.\n\nDevam edilsin mi?`
      )
    ) {
      return;
    }

    setMergingCari(true);
    try {
      const result = await mergeDuplicateCarilerFor(cari, cariKartlar, personeller);
      if (!result) {
        alert('Birleştirilecek mükerrer kart bulunamadı.');
        return;
      }
      setCariKartlar((prev) =>
        prev
          .filter((c) => !result.deletedIds.includes(c.id))
          .map((c) => (c.id === result.keep.id ? result.keep : c))
      );
      setSelectedCariId(result.keep.id);
      alert(
        `"${result.keep.unvan}" birleştirildi.\nKalan kart: ${result.keep.kod || result.keep.id}\nSilinen: ${result.deletedIds.length} kopya`
      );
    } catch (err: any) {
      console.error('Cari birleştirme hatası:', err);
      alert(`Birleştirme başarısız: ${err?.message || 'bilinmeyen hata'}`);
    } finally {
      setMergingCari(false);
    }
  };

  const handleDeleteCari = async (cari: CariKart) => {
    const duplicates = cariKartlar.filter(
      (c) => c.id !== cari.id && firmaEslesir(c.unvan, cari.unvan)
    );
    let idsToDelete = [cari.id];
    if (duplicates.length > 0) {
      const alsoDupes = window.confirm(
        `"${cari.unvan}" için ${duplicates.length} kopya kart daha bulundu.\n\nTamam = hepsini sil\nİptal = yalnızca seçili kartı sil`
      );
      if (alsoDupes) {
        idsToDelete = Array.from(new Set([cari.id, ...duplicates.map((d) => d.id)]));
      }
    } else if (
      !window.confirm(`"${cari.unvan}" cari kartını silmek istediğinize emin misiniz?`)
    ) {
      return;
    }

    setDeletingCari(true);
    try {
      const errors: string[] = [];
      for (const id of idsToDelete) {
        try {
          await removeDocument('cariKartlar', id);
        } catch (err: any) {
          console.error('Cari silme hatası:', id, err);
          errors.push(`${id}: ${err?.message || 'silinemedi'}`);
        }
      }
      setCariKartlar((prev) => prev.filter((c) => !idsToDelete.includes(c.id)));
      if (selectedCariId && idsToDelete.includes(selectedCariId)) {
        setSelectedCariId(null);
      }
      if (errors.length) {
        alert(
          `Bazı cari kayıtları silinemedi (${errors.length}). Yetki veya bağlantı sorununu kontrol edin.\n${errors.slice(0, 3).join('\n')}`
        );
      }
    } finally {
      setDeletingCari(false);
    }
  };

  const handleDeleteStok = async (stok: StokKart) => {
    if (!window.confirm(`"${stok.stokAdi}" stok kartını silmek istediğinize emin misiniz?`)) {
      return;
    }
    setDeletingStok(true);
    try {
      await removeDocument('stokKartlar', stok.id);
      setStokKartlar((prev) => prev.filter((s) => s.id !== stok.id));
      if (selectedStokId === stok.id) setSelectedStokId(null);
    } catch (err: any) {
      console.error('Stok silme hatası:', err);
      alert(err?.message || 'Stok kartı silinemedi. Yetki veya bağlantıyı kontrol edin.');
    } finally {
      setDeletingStok(false);
    }
  };

  const handleDismissPersonelSave = () => {
    if (!dismissingPersonel || !setPersoneller) return;
    if (!dismissDateStr) {
      alert('Lütfen geçerli bir tarih seçin.');
      return;
    }
    setPersoneller((prev) =>
      prev.map((p) =>
        p.id === dismissingPersonel.id
          ? { ...p, durum: false, istenCikisTarihi: dismissDateStr }
          : p
      )
    );
    alert(
      `${dismissingPersonel.ad} ${dismissingPersonel.soyad} işten çıkış tarihi (${dismissDateStr}) kaydedildi; durum Pasif.`
    );
    setDismissingPersonel(null);
  };

  const handleCreateCari = () => {
    if (!newCariUnvan.trim()) return;
    if (editingCariId) {
      if (warnIfDuplicateCari(cariKartlar, newCariUnvan, editingCariId)) return;
      setCariKartlar((prev) =>
        prev.map((c) =>
          c.id === editingCariId
            ? {
                ...c,
                unvan: newCariUnvan,
                kartTipi: newCariType,
                yetkili: newCariYetkili,
                telefon: newCariTelefon,
                eposta: newCariEposta,
                vergiNo: newCariVergiNo,
                vergiDairesi: newCariVergiDairesi,
                adres: newCariAdres,
                iban: newCariIban,
                notlar: newCariNotlar,
              }
            : c
        )
      );
      setSelectedCariId(editingCariId);
      resetCariForm();
      setShowForm(false);
      return;
    }
    if (warnIfDuplicateCari(cariKartlar, newCariUnvan)) return;
    const newC: CariKart = {
      id: `c_${Date.now()}`,
      kartTipi: newCariType,
      kod: `CARI-${Math.floor(100 + Math.random() * 900)}`,
      unvan: newCariUnvan,
      yetkili: newCariYetkili || 'Yetkili Tanımsız',
      telefon: newCariTelefon,
      eposta: newCariEposta,
      vergiNo: newCariVergiNo,
      vergiDairesi: newCariVergiDairesi,
      adres: newCariAdres,
      iban: newCariIban,
      durum: 'AKTIF',
      notlar: newCariNotlar || 'Şantiye cari kartı.',
    };
    setCariKartlar((prev) => [...prev, newC]);
    setSelectedCariId(newC.id);
    resetCariForm();
    setShowForm(false);
  };

  const handleCreateStok = () => {
    if (!newStokAdi.trim()) return;
    if (editingStokId) {
      if (warnIfDuplicateStok(stokKartlar, newStokAdi, editingStokId)) return;
      setStokKartlar((prev) =>
        prev.map((s) =>
          s.id === editingStokId
            ? {
                ...s,
                stokAdi: newStokAdi,
                birim: newStokBirim,
                kategori: newStokKategori,
                aciklama: newStokAciklama,
              }
            : s
        )
      );
      setSelectedStokId(editingStokId);
      resetStokForm();
      setShowForm(false);
      return;
    }
    if (warnIfDuplicateStok(stokKartlar, newStokAdi)) return;
    const newS: StokKart = {
      id: `s_${Date.now()}`,
      stokKodu: `STK-${Math.random().toString(16).substring(2, 6).toUpperCase()}`,
      stokAdi: newStokAdi,
      kategori: newStokKategori,
      birim: newStokBirim,
      kritikSeviye: 0,
      durum: 'AKTIF',
      aciklama: newStokAciklama,
    };
    setStokKartlar((prev) => [...prev, newS]);
    setSelectedStokId(newS.id);
    resetStokForm();
    setShowForm(false);
  };

  const openEditCari = (cr: CariKart) => {
    setEditingCariId(cr.id);
    setNewCariUnvan(cr.unvan);
    setNewCariType(cr.kartTipi);
    setNewCariYetkili(cr.yetkili || '');
    setNewCariTelefon(cr.telefon || '');
    setNewCariEposta(cr.eposta || '');
    setNewCariVergiNo(cr.vergiNo || '');
    setNewCariVergiDairesi(cr.vergiDairesi || '');
    setNewCariAdres(cr.adres || '');
    setNewCariIban(cr.iban || '');
    setNewCariNotlar(cr.notlar || '');
    setShowForm(true);
  };

  const openEditStok = (st: StokKart) => {
    setEditingStokId(st.id);
    setNewStokAdi(st.stokAdi);
    setNewStokBirim(st.birim);
    setNewStokKategori(st.kategori || 'Kaba İnşaat İmalatı');
    setNewStokAciklama(st.aciklama || '');
    setShowForm(true);
  };

  const handleExcelImport = async (fileList: FileList | null) => {
    if (!selectedCari || !fileList?.length) return;
    const files = Array.from(fileList);
    setExcelImporting(true);
    try {
      const { lines, warnings } = await parseCariStokExcelFiles(files);
      if (!lines.length) {
        alert(`Excel okunamadı.\n${warnings.join('\n') || 'Veri satırı bulunamadı.'}`);
        return;
      }
      const ok = window.confirm(
        `${files.length} dosyadan ${lines.length} satır okundu.\n` +
          `Her Excel dosyası ayrı fatura olarak BİRBESAN cari kartına işlenecek.\n` +
          `Stok kartları açılır; mevcut hareket geçmişi korunur.\n` +
          `Hedef cari: ${selectedCari.unvan}\n\nDevam edilsin mi?`
      );
      if (!ok) return;

      const cari =
        normalizeImportText(selectedCari.unvan).includes('birbesan')
          ? ensureBirbesanCari(cariKartlar, setCariKartlar)
          : selectedCari;

      const summary = await applyCariStokExcelImport({
        lines,
        cari,
        stokKartlar,
        setStokKartlar,
        faturalar,
        setFaturalar,
        cariIslemGecmisi,
        setCariIslemGecmisi,
        stokIslemGecmisi,
        setStokIslemGecmisi,
        archiveAsTedarikci: normalizeImportText(cari.unvan).includes('birbesan'),
        stokKaynak: normalizeImportText(cari.unvan).includes('birbesan') ? 'BIRBESAN_EXCEL' : undefined,
      });

      alert(
        `Excel aktarımı tamamlandı.\n` +
          `Yeni stok kartı: ${summary.createdStok}\n` +
          `Güncellenen stok: ${summary.updatedStok}\n` +
          `Fatura: ${summary.createdFatura} (atlanan: ${summary.skippedFatura})\n` +
          `Stok hareketi: ${summary.createdStokIslem} (korunan: ${summary.skippedStokIslem})` +
          (normalizeImportText(cari.unvan).includes('birbesan')
            ? '\n\nBİRBESAN stokları Stok sekmesi → Arşiv listesinde.'
            : '')
      );

      if (normalizeImportText(cari.unvan).includes('birbesan')) {
        setCsTab('stok');
        setStokListeTab('ARSIV');
      }

      if (cari.id !== selectedCariId) setSelectedCariId(cari.id);
      void loadHistoryData('cari', cari.id, cari.unvan, cari.kod);
    } catch (err) {
      alert(`Excel aktarım hatası: ${String((err as Error)?.message || err)}`);
    } finally {
      setExcelImporting(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const handleBirbesanExcelImport = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setExcelImporting(true);
    try {
      const { lines, warnings } = await parseCariStokExcelFiles(files);
      if (!lines.length) {
        alert(`Excel okunamadı.\n${warnings.join('\n') || 'Veri satırı bulunamadı.'}`);
        return;
      }
      const ok = window.confirm(
        `${files.length} Excel dosyasından ${lines.length} satır okundu.\n` +
          `${files.length} dosya → ${files.length} fatura olarak BİRBESAN cari kartına işlenecek.\n` +
          `Stok kartları açılır; mevcut hareket geçmişi korunur.\n\nDevam edilsin mi?`
      );
      if (!ok) return;

      const cari = ensureBirbesanCari(cariKartlar, setCariKartlar);
      const summary = await applyCariStokExcelImport({
        lines,
        cari,
        stokKartlar,
        setStokKartlar,
        faturalar,
        setFaturalar,
        cariIslemGecmisi,
        setCariIslemGecmisi,
        stokIslemGecmisi,
        setStokIslemGecmisi,
        archiveAsTedarikci: true,
        stokKaynak: 'BIRBESAN_EXCEL',
      });

      setCsTab('stok');
      setStokListeTab('ARSIV');
      setSelectedCariId(cari.id);
      void loadHistoryData('cari', cari.id, cari.unvan, cari.kod);

      alert(
        `BİRBESAN arşiv aktarımı tamamlandı.\n` +
          `Yeni stok kartı: ${summary.createdStok}\n` +
          `Güncellenen stok: ${summary.updatedStok}\n` +
          `Fatura: ${summary.createdFatura} (atlanan: ${summary.skippedFatura})\n` +
          `Stok hareketi: ${summary.createdStokIslem} (korunan: ${summary.skippedStokIslem})`
      );
    } catch (err) {
      alert(`Excel aktarım hatası: ${String((err as Error)?.message || err)}`);
    } finally {
      setExcelImporting(false);
      if (birbesanExcelInputRef.current) birbesanExcelInputRef.current.value = '';
    }
  };

  const handleBirbesanCatalogFaturalar = async () => {
    const cari = ensureBirbesanCari(cariKartlar, setCariKartlar);
    const plans = birbesanFaturalarData.faturalar || [];
    if (!plans.length) {
      alert('BİRBESAN fatura kataloğu bulunamadı.');
      return;
    }
    const ok = window.confirm(
      `2 Excel tablosu BİRBESAN faturası olarak işlenecek:\n` +
        plans.map((p) => `• ${p.faturaNo} (${p.kalemler.length} kalem)`).join('\n') +
        `\n\nStok kartları açılır; mevcut işlem geçmişi korunur.\nDevam edilsin mi?`
    );
    if (!ok) return;

    setExcelImporting(true);
    try {
      const summary = await applyBirbesanFaturaPlans({
        cari,
        plans,
        stokKartlar,
        setStokKartlar,
        faturalar,
        setFaturalar,
        cariIslemGecmisi,
        setCariIslemGecmisi,
        stokIslemGecmisi,
        setStokIslemGecmisi,
        archiveAsTedarikci: true,
        stokKaynak: 'BIRBESAN_EXCEL',
      });

      setSelectedCariId(cari.id);
      setCsTab('cari');
      void loadHistoryData('cari', cari.id, cari.unvan, cari.kod);

      alert(
        `BİRBESAN fatura aktarımı tamamlandı.\n` +
          `Yeni stok: ${summary.createdStok} · Güncellenen: ${summary.updatedStok}\n` +
          `Fatura: ${summary.createdFatura} (atlanan: ${summary.skippedFatura})\n` +
          `Stok hareketi: ${summary.createdStokIslem} (korunan: ${summary.skippedStokIslem})`
      );
    } catch (err) {
      alert(`Fatura aktarım hatası: ${String((err as Error)?.message || err)}`);
    } finally {
      setExcelImporting(false);
    }
  };

  const exportLogs = async (format: 'csv' | 'html') => {
    const card = csTab === 'cari' ? selectedCari : selectedStok;
    if (!card) return;
    const name = csTab === 'cari' ? (card as CariKart).unvan : (card as StokKart).stokAdi;
    await exportHistoryReport({
      title: 'Kart Geçmiş Hareket Raporu',
      fileBase: `Kibritci_${csTab === 'cari' ? 'Cari' : 'Stok'}_Gecmis_${card.id}`,
      meta: [
        `Kart Tipi: ${csTab === 'cari' ? 'Cari Firma' : 'Stok Malzeme'}`,
        `Kart Adı: ${name}`,
        `Kart ID: ${card.id}`,
        `Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`,
      ],
      logs: historyList.map((log) => ({
        date: log.date,
        type: log.type,
        title: log.title,
        desc: log.desc,
        kalemler: log.kalemler,
      })),
      format,
    });
  };

  const accent = csTab === 'cari' ? 'amber' : 'teal';

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div
        className={`rounded-3xl p-5 sm:p-6 text-white shadow-md ${
          csTab === 'cari'
            ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900'
            : 'bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
              Finans &amp; Envanter
            </p>
            <h1 className="text-xl sm:text-2xl font-black mt-1">Cari ve Stok Kartları</h1>
            <p className="text-xs text-slate-300 mt-2 max-w-xl leading-relaxed">
              Soldan kartı seçin; sağda kimlik bilgileri ve o karta bağlı tüm alt işlemler
              (satın alma, irsaliye, fatura, zimmet…) kronolojik görünür.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (csTab === 'cari') resetCariForm();
              else {
                if (stokListeTab === 'ARSIV') {
                  alert('Arşiv stokları Excel ile aktarılır. BİRBESAN Excel Aktar butonunu kullanın.');
                  return;
                }
                resetStokForm();
              }
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 bg-white text-slate-900 font-black text-xs px-4 py-2.5 rounded-xl cursor-pointer hover:bg-amber-50"
          >
            <Plus size={14} /> Yeni {csTab === 'cari' ? 'Cari' : 'Stok'}
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setCsTab('cari')}
            className={`px-4 py-2 rounded-xl text-xs font-black border cursor-pointer ${
              csTab === 'cari'
                ? 'bg-amber-400 text-slate-900 border-amber-300'
                : 'bg-white/10 text-white border-white/15 hover:bg-white/15'
            }`}
          >
            <Building2 size={13} className="inline mr-1.5" />
            Cari ({cariKartlar.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setCsTab('stok');
              setStokListeTab('AKTIF');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black border cursor-pointer ${
              csTab === 'stok'
                ? 'bg-teal-300 text-slate-900 border-teal-200'
                : 'bg-white/10 text-white border-white/15 hover:bg-white/15'
            }`}
          >
            <Package size={13} className="inline mr-1.5" />
            Stok ({stokTabCounts.aktif})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[62vh]">
        {/* Liste */}
        <aside className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden max-h-[78vh]">
          {csTab === 'stok' && (
            <div className="p-2 border-b border-slate-100 space-y-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setStokListeTab('AKTIF')}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black border cursor-pointer ${
                    stokListeTab === 'AKTIF'
                      ? 'bg-teal-100 text-teal-900 border-teal-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  Aktif ({stokTabCounts.aktif})
                </button>
                <button
                  type="button"
                  onClick={() => setStokListeTab('ARSIV')}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black border cursor-pointer flex items-center justify-center gap-1 ${
                    stokListeTab === 'ARSIV'
                      ? 'bg-amber-100 text-amber-900 border-amber-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  <Archive size={11} />
                  Arşiv ({stokTabCounts.arsiv})
                </button>
              </div>
              {stokListeTab === 'ARSIV' && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-2 space-y-2">
                  <p className="text-[10px] text-amber-900 leading-snug">
                    BİRBESAN firmasına ait tedarikçi stok kartları ve birim fiyatları (Excel arşivi).
                    {stokTabCounts.birbesan > 0 ? ` ${stokTabCounts.birbesan} BİRBESAN kaydı.` : ''}
                  </p>
                  <input
                    ref={birbesanExcelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleBirbesanExcelImport(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => birbesanExcelInputRef.current?.click()}
                    disabled={excelImporting}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-black bg-sky-600 text-white cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={12} />
                    {excelImporting ? 'Aktarılıyor…' : 'BİRBESAN Excel Aktar'}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="p-3 border-b border-slate-100">
            <label className="relative block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={csTab === 'cari' ? cariSearchQuery : stokSearchQuery}
                onChange={(e) =>
                  csTab === 'cari'
                    ? setCariSearchQuery(e.target.value)
                    : setStokSearchQuery(e.target.value)
                }
                placeholder={csTab === 'cari' ? 'Ünvan, kod, IBAN…' : 'Ad, kod, kategori…'}
                className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400"
              />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {csTab === 'cari'
              ? filteredCariKartlar.map((cr) => {
                  const active = cr.id === selectedCariId;
                  const dupeCount = findDuplicateCariler(cr, cariKartlar).length;
                  return (
                    <button
                      key={cr.id}
                      type="button"
                      onClick={() => setSelectedCariId(cr.id)}
                      className={`w-full text-left px-3 py-3 border-b border-slate-50 transition cursor-pointer ${
                        active
                          ? 'bg-amber-50 border-l-4 border-l-amber-500'
                          : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono font-bold text-slate-500">{cr.kod}</p>
                          <p className="text-xs font-black text-slate-900 truncate mt-0.5">{cr.unvan}</p>
                          <p className="text-[10px] text-amber-800 font-bold mt-0.5">{cr.kartTipi}</p>
                          {dupeCount > 0 && (
                            <p className="text-[9px] font-black text-rose-700 mt-1">
                              ×{dupeCount + 1} mükerrer
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full h-fit ${
                            cr.durum === 'AKTIF'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {cr.durum}
                        </span>
                      </div>
                    </button>
                  );
                })
              : filteredStokKartlar.map((st) => {
                  const active = st.id === selectedStokId;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStokId(st.id)}
                      className={`w-full text-left px-3 py-3 border-b border-slate-50 transition cursor-pointer ${
                        active
                          ? 'bg-teal-50 border-l-4 border-l-teal-500'
                          : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono font-bold text-slate-500">{st.stokKodu}</p>
                          <p className="text-xs font-black text-slate-900 truncate mt-0.5">{st.stokAdi}</p>
                          <p className="text-[10px] text-teal-800 font-bold mt-0.5">
                            {st.birim}
                            {st.miktar != null && st.miktar > 0 ? ` · ${Number(st.miktar).toLocaleString('tr-TR')}` : ''}
                            {st.sonBirimFiyat != null && st.sonBirimFiyat > 0
                              ? ` · ₺${st.sonBirimFiyat.toLocaleString('tr-TR')}`
                              : ''}
                          </p>
                          {isBirbesanStokArsiv(st) && (
                            <p className="text-[9px] font-black text-amber-700 mt-0.5">BİRBESAN ARŞİV</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full h-fit bg-emerald-100 text-emerald-800">
                          {st.durum}
                        </span>
                      </div>
                    </button>
                  );
                })}
            {(csTab === 'cari' ? filteredCariKartlar : filteredStokKartlar).length === 0 && (
              <p className="p-8 text-center text-xs text-slate-400">
                {csTab === 'stok' && stokListeTab === 'ARSIV'
                  ? 'Arşivde stok yok. BİRBESAN Excel dosyalarını yükleyin.'
                  : 'Kayıt bulunamadı.'}
              </p>
            )}
          </div>
        </aside>

        {/* Detay + alt işlemler */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-4">
          {csTab === 'cari' && !selectedCari && (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-sm">
              Soldan bir cari kart seçin.
            </div>
          )}
          {csTab === 'stok' && !selectedStok && (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-sm">
              Soldan bir stok kartı seçin.
            </div>
          )}

          {csTab === 'cari' && selectedCari && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap justify-between gap-3 items-start">
                <div>
                  <p className="text-[10px] font-mono font-bold text-slate-500">{selectedCari.kod}</p>
                  <h2 className="text-lg font-black text-slate-900 mt-0.5">{selectedCari.unvan}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {[selectedCari.kartTipi, selectedCari.yetkili, selectedCari.telefon]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedCari.kartTipi === 'TEDARIKCI' && (
                    <>
                      <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        multiple
                        className="hidden"
                        onChange={(e) => void handleExcelImport(e.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => excelInputRef.current?.click()}
                        disabled={excelImporting}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-sky-50 text-sky-900 border border-sky-200 cursor-pointer disabled:opacity-50"
                        title="Excel cari hesap / fatura listesinden stok kartı ve fiyat aktar"
                      >
                        <Upload size={12} />
                        {excelImporting ? 'Aktarılıyor…' : 'Excel Stok Aktar'}
                      </button>
                      {normalizeImportText(selectedCari.unvan).includes('birbesan') && (
                        <button
                          type="button"
                          onClick={() => void handleBirbesanCatalogFaturalar()}
                          disabled={excelImporting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-950 border border-amber-200 cursor-pointer disabled:opacity-50"
                          title="2 Excel tablosunu BİRBESAN faturası + stok kartı olarak kaydet"
                        >
                          <Receipt size={12} />
                          {excelImporting ? 'İşleniyor…' : '2 Excel → Fatura Kes'}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditCari(selectedCari)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 cursor-pointer"
                  >
                    <Pencil size={12} /> Düzenle
                  </button>
                  {selectedCariDuplicates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleMergeCari(selectedCari)}
                      disabled={mergingCari || deletingCari}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-violet-50 text-violet-900 border border-violet-200 cursor-pointer disabled:opacity-50"
                      title={`${selectedCariDuplicates.length} mükerrer kartı birleştir`}
                    >
                      <GitMerge size={12} /> {mergingCari ? 'Birleştiriliyor…' : `Birleştir (${selectedCariDuplicates.length + 1})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteCari(selectedCari)}
                    disabled={deletingCari}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} /> {deletingCari ? 'Siliniyor…' : 'Sil'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-[9px] font-black uppercase text-slate-400">IBAN</p>
                  <p className="font-mono font-bold text-slate-800 mt-1 break-all">
                    {selectedCari.iban || '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-[9px] font-black uppercase text-slate-400">Vergi</p>
                  <p className="font-bold text-slate-800 mt-1">
                    {selectedCari.vergiNo || '—'}
                    {selectedCari.vergiDairesi ? ` · ${selectedCari.vergiDairesi}` : ''}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 sm:col-span-2">
                  <p className="text-[9px] font-black uppercase text-slate-400">Adres / Not</p>
                  <p className="font-medium text-slate-700 mt-1">
                    {selectedCari.adres || selectedCari.notlar || '—'}
                  </p>
                </div>
              </div>

              {/* Bağlı personeller — firmaAdi ↔ cari unvan eşleşmesi (Yurt Mekanik vb.) */}
              <div className="border border-indigo-100 rounded-2xl overflow-hidden bg-indigo-50/40">
                <div className="px-4 py-3 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                      <Users size={13} /> Bu cariye bağlı personeller
                    </h3>
                    <p className="text-[10px] text-indigo-800/70 mt-0.5">
                      Personel kartındaki firma adı bu cari unvanıyla eşleşenler. Aktif:{' '}
                      {bagliPersonelAktifSayisi}/{bagliPersoneller.length}
                    </p>
                  </div>
                  <span className="text-[10px] font-black bg-white text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-full">
                    {bagliPersoneller.length} kişi
                  </span>
                </div>
                {bagliPersoneller.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[11px] text-slate-500 space-y-1">
                    <p>Bu firmaya bağlı personel bulunamadı.</p>
                    <p className="text-[10px] text-slate-400">
                      Personel Kayıt’ta firma tipi Taşeron seçilip <strong>{selectedCari.unvan}</strong>{' '}
                      atanmalı (büyük/küçük harf farkı sorun olmaz).
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[280px]">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-white/80 text-slate-500 uppercase text-[9px] font-bold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Ad Soyad</th>
                          <th className="px-3 py-2">Görev</th>
                          <th className="px-3 py-2">Firma (kayıt)</th>
                          <th className="px-3 py-2">Telefon</th>
                          <th className="px-3 py-2 text-center">Durum</th>
                          <th className="px-3 py-2 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bagliPersoneller.map((p) => {
                          const aktif = isPersonelActiveOnDate(p, bugun);
                          return (
                            <tr
                              key={p.id}
                              className={`border-t border-indigo-100/80 ${
                                aktif ? 'bg-white/70' : 'bg-slate-50/80 opacity-70'
                              }`}
                            >
                              <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                                {p.ad} {p.soyad}
                              </td>
                              <td className="px-3 py-2 text-slate-700">{displayPersonelGorev(p)}</td>
                              <td className="px-3 py-2 text-slate-600">{p.firmaAdi || '—'}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {p.telefonNo || '—'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span
                                  className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                                    aktif
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {aktif ? 'Aktif' : 'Pasif'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {aktif && setPersoneller ? (
                                  <button
                                    type="button"
                                    title="İşten çıkar"
                                    onClick={() => {
                                      setDismissDateStr(todayDateKey());
                                      setDismissingPersonel(p);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer"
                                  >
                                    <UserX size={12} /> İşten çıkar
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Tedarikçi stok kartları — BİRBESAN arşiv dahil */}
              {(selectedCari.kartTipi === 'TEDARIKCI' || cariBagliStoklar.length > 0) && (
                <div className="border border-amber-100 rounded-2xl overflow-hidden bg-amber-50/40">
                  <div className="px-4 py-3 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-[11px] font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                        <Package size={13} /> Bu cariye bağlı stok kartları
                      </h3>
                      <p className="text-[10px] text-amber-900/70 mt-0.5">
                        {normalizeImportText(selectedCari.unvan).includes('birbesan')
                          ? 'BİRBESAN Excel arşiv stokları bu cari kart altında listelenir.'
                          : 'Tedarikçiye bağlı stok kartları ve birim fiyatları.'}
                        {cariBagliStokIslemleri.length > 0
                          ? ` ${cariBagliStokIslemleri.length} giriş/çıkış hareketi.`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black bg-white text-amber-900 border border-amber-200 px-2.5 py-1 rounded-full">
                        {cariBagliStoklar.length} stok
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          printCariStokTopluYazdir(
                            selectedCari,
                            cariBagliStoklar,
                            cariBagliStokIslemleri
                          )
                        }
                        disabled={cariBagliStoklar.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-slate-900 text-white border border-slate-900 cursor-pointer disabled:opacity-40"
                        title="Tüm stok kartlarını ve giriş/çıkış hareketlerini yazdır"
                      >
                        <Printer size={12} />
                        Toplu Yazdır
                      </button>
                    </div>
                  </div>
                  {cariBagliStoklar.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[11px] text-slate-500 space-y-1">
                      <p>Bu cariye bağlı stok kartı bulunamadı.</p>
                      <p className="text-[10px] text-slate-400">
                        {normalizeImportText(selectedCari.unvan).includes('birbesan')
                          ? 'BİRBESAN Excel Aktar ile stokları bu karta aktarabilirsiniz.'
                          : 'Excel Stok Aktar veya stok kartında tedarikçi alanını doldurun.'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[320px]">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-white/80 text-slate-500 uppercase text-[9px] font-bold sticky top-0">
                          <tr>
                            <th className="px-3 py-2">Stok Adı</th>
                            <th className="px-3 py-2">Kod</th>
                            <th className="px-3 py-2">Birim</th>
                            <th className="px-3 py-2 text-right">Miktar</th>
                            <th className="px-3 py-2 text-right">Son Fiyat</th>
                            <th className="px-3 py-2 text-right">İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cariBagliStoklar.map((st) => (
                            <tr
                              key={st.id}
                              className="border-t border-amber-100/80 bg-white/70 hover:bg-amber-50/60"
                            >
                              <td className="px-3 py-2 font-bold text-slate-900">
                                {st.stokAdi}
                                {isBirbesanStokArsiv(st) && (
                                  <span className="ml-1.5 text-[8px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-200 rounded px-1 py-0.5">
                                    Arşiv
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-600">{st.stokKodu}</td>
                              <td className="px-3 py-2 text-slate-700">{st.birim}</td>
                              <td className="px-3 py-2 text-right font-bold text-slate-900">
                                {Number(st.miktar ?? 0).toLocaleString('tr-TR')}
                              </td>
                              <td className="px-3 py-2 text-right text-emerald-800 font-semibold">
                                {st.sonBirimFiyat != null && st.sonBirimFiyat > 0
                                  ? `₺${st.sonBirimFiyat.toLocaleString('tr-TR')}`
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCsTab('stok');
                                    setStokListeTab(st.arsivde ? 'ARSIV' : 'AKTIF');
                                    setSelectedStokId(st.id);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white text-amber-900 border border-amber-200 hover:bg-amber-100 cursor-pointer"
                                >
                                  <Eye size={11} /> Aç
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <CariTimeline
                cariUnvan={selectedCari.unvan}
                items={historyList
                  .filter(
                    (h) =>
                      h.type === 'İRSALİYE' ||
                      h.type === 'İRSALİYE GİRİŞİ'
                  )
                  .map((h) => ({
                    id: h.id,
                    type: h.type,
                    title: h.title,
                    desc: h.desc,
                    date: formatDateLabelTr(h.date),
                  }))}
                onOpenAll={() => {
                  setHistoryFilter('İRSALİYE');
                  document
                    .getElementById('cari-stok-history-panel')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            </div>
          )}

          {csTab === 'stok' && selectedStok && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap justify-between gap-3 items-start">
                <div>
                  <p className="text-[10px] font-mono font-bold text-slate-500">{selectedStok.stokKodu}</p>
                  <h2 className="text-lg font-black text-slate-900 mt-0.5">{selectedStok.stokAdi}</h2>
                  {isBirbesanStokArsiv(selectedStok) && (
                    <span className="inline-flex mt-1 text-[10px] font-black uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-200 rounded-lg px-2 py-0.5">
                      BİRBESAN Arşiv Stok
                    </span>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedStok.kategori} · Birim: {selectedStok.birim}
                    {selectedStok.sonBirimFiyat != null && selectedStok.sonBirimFiyat > 0 && (
                      <span className="ml-2 font-bold text-emerald-700">
                        Son fiyat: ₺{selectedStok.sonBirimFiyat.toLocaleString('tr-TR')}
                        {selectedStok.sonFiyatTarihi ? ` (${selectedStok.sonFiyatTarihi})` : ''}
                      </span>
                    )}
                    {selectedStok.tedarikciUnvan && (
                      <span className="ml-2 text-amber-800">Tedarikçi: {selectedStok.tedarikciUnvan}</span>
                    )}
                    <span className="ml-2 inline-flex items-center font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5">
                      Stok: {Number(selectedStok.miktar ?? 0).toLocaleString('tr-TR')} {selectedStok.birim}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditStok(selectedStok)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-teal-50 text-teal-900 border border-teal-200 cursor-pointer"
                  >
                    <Pencil size={12} /> Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteStok(selectedStok)}
                    disabled={deletingStok}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} /> {deletingStok ? 'Siliniyor…' : 'Sil'}
                  </button>
                </div>
              </div>
              {selectedStok.aciklama && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">
                  {selectedStok.aciklama}
                </p>
              )}
            </div>
          )}

          {(selectedCari || selectedStok) && (
            <div id="cari-stok-history-panel" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <ClipboardList size={14} className={accent === 'amber' ? 'text-amber-600' : 'text-teal-600'} />
                    {selectedCari ? 'Geçmiş İrsaliyeler' : 'Alt işlemler / hareket geçmişi'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {selectedCari ? (
                      <>
                        İrsaliyeleri işaretleyip bir veya birden fazlasını tek faturaya dönüştürebilirsiniz
                        {' · '}
                        {historyList.filter((h) => h.collection === 'irsaliyeler').length} irsaliye
                        {' · '}
                        {historyList.length} toplam kayıt
                      </>
                    ) : (
                      <>
                        {historyList.length} kayıt · evrak varsa <strong>Detay</strong> ile kalemleri ve görselleri açın
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedCari && isSekerVidanjorFirma(selectedCari.unvan) && (
                    <button
                      type="button"
                      onClick={() => void handleResetSekerVidanjorFaturaBaglari()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-rose-700 text-white cursor-pointer"
                      title="Vidanjör irsaliyelerindeki taslak fatura bağlarını temizle — mutabakat öncesi"
                    >
                      <RefreshCw size={12} /> Fatura Bağlarını Sıfırla (Mutabakat)
                    </button>
                  )}
                  {selectedIrsaliyeIds.size > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={handleBagSelectedIrsaliyelerToFatura}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-violet-700 text-white cursor-pointer"
                        title="Seçili irsaliyeleri birleştirip taslak faturaya dönüştür (kilitlenmez)"
                      >
                        <Receipt size={12} /> Seçilenleri Faturaya Dönüştür ({selectedIrsaliyeIds.size})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIrsaliyeIds(new Set())}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-white text-slate-600 border border-slate-200 cursor-pointer"
                      >
                        Seçimi temizle
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleOpenZincirRaporuFromCari}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-amber-600 text-white cursor-pointer"
                    title="SA → İrsaliye → Fatura zincir raporu"
                  >
                    <ClipboardList size={12} /> Zincir Raporu
                  </button>
                  <button
                    type="button"
                    onClick={() => exportLogs('csv')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 text-white cursor-pointer"
                  >
                    <Download size={12} /> CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportLogs('html')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 text-white cursor-pointer"
                  >
                    <FileText size={12} /> HTML
                  </button>
                </div>
              </div>

              <div className="px-5 py-3 border-b border-slate-50 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('ALL')}
                  className={`text-[10px] font-black px-2.5 py-1 rounded-lg border cursor-pointer ${
                    historyFilter === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Tümü ({historyList.length})
                </button>
                {Object.entries(historyTypeCounts).map(([type, count]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setHistoryFilter(type)}
                    className={`text-[10px] font-black px-2.5 py-1 rounded-lg border cursor-pointer ${
                      historyFilter === type
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {type} ({count})
                  </button>
                ))}
              </div>

              <div className="p-5 max-h-[48vh] overflow-y-auto space-y-4">
                {historyLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-xs font-bold">
                    <RefreshCw size={16} className="animate-spin" /> İşlem geçmişi yükleniyor…
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs">
                    Bu filtrede / kartta işlem kaydı yok.
                  </div>
                ) : (
                  historyByMonth.map((group) => (
                    <div key={group.monthKey} className="space-y-2.5">
                      <div className="sticky top-0 z-[1] flex flex-wrap items-center justify-between gap-2 bg-white/95 backdrop-blur-sm py-1.5 border-b border-slate-100">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-800">
                          {group.label}
                        </h4>
                        <span className="text-[10px] font-bold text-slate-500">
                          {group.items.length} kayıt
                          {group.hizmetToplam > 0
                            ? ` · ${group.hizmetToplam.toLocaleString('tr-TR')} ${group.etiket}`
                            : ''}
                        </span>
                      </div>
                      {group.items.map((log, idx) => (
                    <div
                      key={`${log.id}-${idx}`}
                      className="flex gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50/80 hover:border-slate-300 transition"
                    >
                      {log.collection === 'irsaliyeler' && (
                        <label className="shrink-0 self-center flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedIrsaliyeIds.has(log.id)}
                            onChange={() => toggleIrsaliyeSelection(log.id)}
                            className="w-4 h-4 rounded border-slate-300 text-violet-700 cursor-pointer"
                            title="Faturaya dönüştürmek için seç"
                          />
                        </label>
                      )}
                      <div className="shrink-0 w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                        {TYPE_ICON[log.type] || <ClipboardList size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${log.badgeColor}`}
                          >
                            {log.type}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            {formatDateLabelTr(log.date)}
                            {normalizeDateKey(log.date) ? (
                              <span className="text-slate-300"> · {normalizeDateKey(log.date)}</span>
                            ) : null}
                          </span>
                        </div>
                        <p className="text-xs font-black text-slate-900 mt-1">{log.title}</p>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{log.desc}</p>
                      </div>
                      {log.collection && (
                        <button
                          type="button"
                          onClick={() => void openHistoryDetay(log)}
                          disabled={detailLoadingId === log.id}
                          className="shrink-0 self-center inline-flex items-center gap-1 text-[10px] font-black text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2.5 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                        >
                          {detailLoadingId === log.id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <Eye size={12} />
                          )}
                          Detay
                        </button>
                      )}
                    </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <EvrakDetayModal
        open={!!detayPayload}
        payload={detayPayload}
        onClose={() => setDetayPayload(null)}
      />

      {genericDetail && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/70 flex items-center justify-center p-4"
          onClick={() => setGenericDetail(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-sm text-slate-900">{genericDetail.title}</h3>
              <button
                type="button"
                onClick={() => setGenericDetail(null)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <dl className="grid grid-cols-2 gap-2">
                {genericDetail.rows.map((row) => (
                  <React.Fragment key={row.label}>
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="font-semibold text-slate-800 break-words">{row.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {genericDetail.attachmentUrl && (
                <button
                  type="button"
                  onClick={() =>
                    openBase64InNewTab(
                      genericDetail.attachmentUrl!,
                      genericDetail.attachmentName || 'evrak.jpg'
                    )
                  }
                  className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 py-2.5 rounded-xl cursor-pointer"
                >
                  <FileText size={13} /> Evrakı görüntüle
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`p-4 text-white flex justify-between items-center ${
                csTab === 'cari' ? 'bg-amber-600' : 'bg-teal-700'
              }`}
            >
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider opacity-80">
                  {csTab === 'cari' ? 'Cari Kart' : 'Stok Kartı'}
                </p>
                <h3 className="text-sm font-black">
                  {csTab === 'cari'
                    ? editingCariId
                      ? 'Cari Düzenle'
                      : 'Yeni Cari'
                    : editingStokId
                      ? 'Stok Düzenle'
                      : 'Yeni Stok'}
                </h3>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              {csTab === 'cari' ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Firma Ünvanı *</span>
                    <input
                      value={newCariUnvan}
                      onChange={(e) => setNewCariUnvan(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Kart Tipi</span>
                    <select
                      value={newCariType}
                      onChange={(e) => setNewCariType(e.target.value as CariKart['kartTipi'])}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    >
                      <option value="TEDARIKCI">Tedarikçi</option>
                      <option value="TASERON">Taşeron</option>
                      <option value="ALICI">Alıcı</option>
                      <option value="SATICI">Satıcı</option>
                      <option value="PERSONEL">Personel</option>
                      <option value="ORTAKLAR">Ortaklar</option>
                      <option value="CARI">Diğer Cari</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Yetkili</span>
                    <input
                      value={newCariYetkili}
                      onChange={(e) => setNewCariYetkili(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-500">Telefon</span>
                      <input
                        value={newCariTelefon}
                        onChange={(e) => setNewCariTelefon(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-500">E-posta</span>
                      <input
                        value={newCariEposta}
                        onChange={(e) => setNewCariEposta(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-500">Vergi No</span>
                      <input
                        value={newCariVergiNo}
                        onChange={(e) => setNewCariVergiNo(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-500">Vergi Dairesi</span>
                      <input
                        value={newCariVergiDairesi}
                        onChange={(e) => setNewCariVergiDairesi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">IBAN</span>
                    <input
                      value={newCariIban}
                      onChange={(e) => setNewCariIban(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Adres</span>
                    <textarea
                      rows={2}
                      value={newCariAdres}
                      onChange={(e) => setNewCariAdres(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Notlar</span>
                    <input
                      value={newCariNotlar}
                      onChange={(e) => setNewCariNotlar(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Stok Adı *</span>
                    <input
                      value={newStokAdi}
                      onChange={(e) => setNewStokAdi(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Kategori</span>
                    <select
                      value={newStokKategori}
                      onChange={(e) => setNewStokKategori(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    >
                      <option value="Kaba İnşaat İmalatı">Kaba İnşaat İmalatı</option>
                      <option value="Dış Cephe İmalatı">Dış Cephe İmalatı</option>
                      <option value="İnce İşler İmalatı">İnce İşler İmalatı</option>
                      <option value="Elektrik Tesisat Malzemesi">Elektrik Tesisat Malzemesi</option>
                      <option value="Mekanik Tesisat Malzemesi">Mekanik Tesisat Malzemesi</option>
                      <option value="Diğer Malzeme">Diğer Malzeme</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Birim</span>
                    <select
                      value={newStokBirim}
                      onChange={(e) => setNewStokBirim(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    >
                      <option value="TON">TON</option>
                      <option value="M3">M3</option>
                      <option value="KG">KG</option>
                      <option value="ADET">ADET</option>
                      <option value="TORBA">TORBA</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Açıklama</span>
                    <input
                      value={newStokAciklama}
                      onChange={(e) => setNewStokAciklama(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={csTab === 'cari' ? handleCreateCari : handleCreateStok}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-black cursor-pointer ${
                  csTab === 'cari' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {dismissingPersonel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-150 p-6 w-[400px] max-w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-rose-600">
              <UserX size={20} />
              <h3 className="font-display font-bold text-sm uppercase tracking-wider">
                Personel İşten Çıkarma
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>
                {dismissingPersonel.ad} {dismissingPersonel.soyad}
              </strong>{' '}
              ({selectedCari?.unvan || dismissingPersonel.firmaAdi || 'cari'}) personeli için işten
              çıkış kaydı yapılacak.
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">
                İşten Çıkış / Ayrılma Tarihi *
              </label>
              <input
                type="date"
                required
                value={dismissDateStr}
                onChange={(e) => setDismissDateStr(e.target.value)}
                className="w-full text-xs font-semibold border border-rose-200 rounded-lg p-2.5 bg-slate-50 text-rose-950 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleDismissPersonelSave}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-xl transition cursor-pointer"
              >
                Kaydet
              </button>
              <button
                type="button"
                onClick={() => setDismissingPersonel(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CariStokScreen;
