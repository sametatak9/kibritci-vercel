import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Users, User, Phone, Mail, MapPin, Calendar, CreditCard,
  Truck, Tent, Clock, ClipboardList, Sparkles, Activity,
  FileSpreadsheet, Search, Filter, ChevronDown, ChevronRight,
  Building2, Briefcase, CheckSquare, Square, Printer, BarChart3,
  Banknote, Shield, Star, TrendingUp, AlertCircle, CheckCircle2,
  XCircle, MinusCircle, Hash, Download, RefreshCw, Eye
} from 'lucide-react';
import { Personel, AylikYoklamaMap, AracBakim, KampKaydi, KampOdasi, HazirTutanak, KasaHareketi, SahaFaaliyeti, MaaşOdeme } from '../types/erp';
import { getYoklamaDay, iterateMonthYoklama, isDayActiveForPersonel, asYoklamaGunMap, parseYoklamaDateKey, normalizeTurkishName } from '../lib/yoklamaUtils';
import { PersonelIdCard } from './PersonelIdCard';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

/* ─────────────────────────────────────────
   INTERFACES
───────────────────────────────────────── */
interface PersonelIzinBelgesi {
  id: string;
  personelId: string;
  personelIsim?: string;
  izinTipi?: string;
  baslangicTarihi?: string;
  bitisTarihi?: string;
  toplamGun?: number;
  aciklama?: string;
  onayDurumu?: string;
}

interface PersonelKartlariScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  araclar: AracBakim[];
  kampKayitlari: KampKaydi[];
  kampOdalari: KampOdasi[];
  hazirTutanaklar?: HazirTutanak[];
  kasaHareketleri?: KasaHareketi[];
  sahaFaaliyetleri?: SahaFaaliyeti[];
  maasOdemeleri?: MaaşOdeme[];
}

type TabKey = 'ozet' | 'devam' | 'mesai' | 'odeme' | 'kamp' | 'saha' | 'belgeler';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'ozet',     label: 'Özet',      icon: '📋' },
  { key: 'devam',    label: 'Devam',     icon: '📅' },
  { key: 'mesai',    label: 'Mesai',     icon: '⏱️' },
  { key: 'odeme',    label: 'Ödeme',     icon: '💵' },
  { key: 'kamp',     label: 'Kamp',      icon: '🏕️' },
  { key: 'saha',     label: 'Saha',      icon: '⛏️' },
  { key: 'belgeler', label: 'Belgeler',  icon: '📁' },
];

const AY_ADLARI = ['', 'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

/* ─────────────────────────────────────────
   YARDIMCI FONKSİYONLAR
───────────────────────────────────────── */
const isPersonelAktif = (p: Personel) => p.durum === true || String(p.durum) === 'true';
const getFirmaLabel = (p: Personel): string =>
  p.firmaTipi === 'TASERON' ? (p.firmaAdi?.trim() || 'Taşeron (Diğer)') : 'Kibritçi İnşaat';

function getDayStatusMeta(durum: string) {
  switch (durum) {
    case 'Geldi':   return { cls: 'bg-emerald-500 text-white', short: 'G' };
    case 'Yok':     return { cls: 'bg-rose-500 text-white', short: 'Y' };
    case 'İzinli':  return { cls: 'bg-sky-400 text-white', short: 'İ' };
    case 'Raporlu': return { cls: 'bg-amber-400 text-slate-900', short: 'R' };
    case 'Pazar':
    case 'Tatil':   return { cls: 'bg-slate-200 text-slate-500', short: 'T' };
    default:        return { cls: 'bg-slate-100 text-slate-300', short: '' };
  }
}

/* ─────────────────────────────────────────
   ANA BILEŞEN
───────────────────────────────────────── */
export const PersonelKartlariScreen: React.FC<PersonelKartlariScreenProps> = ({
  personeller,
  yoklamalar,
  araclar,
  kampKayitlari,
  kampOdalari,
  hazirTutanaklar = [],
  kasaHareketleri = [],
  sahaFaaliyetleri = [],
  maasOdemeleri = [],
}) => {
  /* ── State ── */
  const [selectedPersId, setSelectedPersId] = useState<string>(personeller[0]?.id || '');
  const [selectedTab, setSelectedTab]     = useState<TabKey>('ozet');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear]   = useState<number>(new Date().getFullYear());

  /* Filtre state */
  const [searchQuery, setSearchQuery]   = useState('');
  const [firmaFilter, setFirmaFilter]   = useState('HEPSI');
  const [gorevFilter, setGorevFilter]   = useState('HEPSI');
  const [durumFilter, setDurumFilter]   = useState<'AKTIF' | 'PASIF' | 'HEPSI'>('AKTIF');

  /* Çoklu seçim */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* Firebase izin belgeleri */
  const [izinBelgeleri, setIzinBelgeleri] = useState<PersonelIzinBelgesi[]>([]);
  const [izinLoading, setIzinLoading]     = useState(false);

  /* ── Firebase Yükle ── */
  useEffect(() => {
    let cancelled = false;
    setIzinLoading(true);
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'personelIzinFormlari'));
        if (cancelled) return;
        const list: PersonelIzinBelgesi[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<PersonelIzinBelgesi, 'id'>) }));
        setIzinBelgeleri(list);
      } catch (err) {
        console.warn('İzin belgeleri yüklenemedi:', err);
      } finally {
        if (!cancelled) setIzinLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Filtre Options ── */
  const firmaOptions = useMemo(() => {
    const set = new Set<string>();
    personeller.forEach((p) => set.add(getFirmaLabel(p)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [personeller]);

  const gorevOptions = useMemo(() => {
    const set = new Set<string>();
    personeller.forEach((p) => { if (p.gorev) set.add(p.gorev); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [personeller]);

  /* ── Filtrelenmiş Personel Listesi ── */
  const filteredPersoneller = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return personeller.filter((p) => {
      if (durumFilter === 'AKTIF' && !isPersonelAktif(p)) return false;
      if (durumFilter === 'PASIF' && isPersonelAktif(p)) return false;
      if (firmaFilter !== 'HEPSI' && getFirmaLabel(p) !== firmaFilter) return false;
      if (gorevFilter !== 'HEPSI' && p.gorev !== gorevFilter) return false;
      if (q) {
        const fullName = `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR');
        if (!fullName.includes(q) && !(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q)) return false;
      }
      return true;
    });
  }, [personeller, durumFilter, firmaFilter, gorevFilter, searchQuery]);

  /* Seçili personel filtre dışında kalırsa ilke geç */
  useEffect(() => {
    if (!filteredPersoneller.some((p) => p.id === selectedPersId)) {
      setSelectedPersId(filteredPersoneller[0]?.id || '');
    }
  }, [filteredPersoneller, selectedPersId]);

  const selectedPersonnel = personeller.find((p) => p.id === selectedPersId);

  /* ── Çoklu Seçim Helpers ── */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPersoneller.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPersoneller.map((p) => p.id)));
    }
  };

  /* ── Finansal Hesaplama ── */
  const getFinansalDetay = useCallback((p: Personel) => {
    const pYoklama = yoklamalar[p.id] || {};
    let workedDays = 0;
    let totalMesaiSaat = 0;
    iterateMonthYoklama(pYoklama, selectedYear, selectedMonth, (day, d) => {
      if (d?.durum === 'Geldi' && isDayActiveForPersonel(p, selectedYear, selectedMonth, day, pYoklama)) {
        workedDays += 1;
        totalMesaiSaat += (d as any).mesaiSaati || 0;
      }
    });
    const daysInMonth  = new Date(selectedYear, selectedMonth, 0).getDate();
    const dailyWage    = p.maas / Math.max(1, daysInMonth);
    const grossEarned  = workedDays * dailyWage;
    const izinliGun    = (() => {
      let cnt = 0;
      iterateMonthYoklama(pYoklama, selectedYear, selectedMonth, (_day, d) => {
        if (d?.durum === 'İzinli') cnt++;
      });
      return cnt;
    })();
    const yokGun = (() => {
      let cnt = 0;
      iterateMonthYoklama(pYoklama, selectedYear, selectedMonth, (_day, d) => {
        if (d?.durum === 'Yok') cnt++;
      });
      return cnt;
    })();

    const avansHareketleri = kasaHareketleri.filter(
      (k) =>
        k.hareketTipi === 'ÇIKIŞ' &&
        k.referansTipi === 'MAAS' &&
        (k.personelId === p.id ||
          (k.aciklama.toLowerCase().includes(p.ad.toLowerCase()) &&
           k.aciklama.toLowerCase().includes(p.soyad.toLowerCase())))
    );
    const totalAvans = avansHareketleri.reduce((acc, k) => acc + k.tutar, 0);
    const netAlacak  = Math.max(0, grossEarned - totalAvans);

    /* Maaş ödeme geçmişi */
    const maasGecmis = maasOdemeleri.filter((m) => m.personelId === p.id);

    return {
      workedDays, totalMesaiSaat, grossEarned: Math.round(grossEarned),
      totalAvans: Math.round(totalAvans), netAlacak: Math.round(netAlacak),
      daysInMonth, izinliGun, yokGun, avansHareketleri, maasGecmis,
    };
  }, [yoklamalar, kasaHareketleri, maasOdemeleri, selectedYear, selectedMonth]);

  /* ── Personele Özgü Hesaplamalar ── */
  const fin = useMemo(
    () => (selectedPersonnel ? getFinansalDetay(selectedPersonnel) : null),
    [selectedPersonnel, getFinansalDetay]
  );

  const assignedVehicle = selectedPersonnel
    ? araclar.find((a) => a.sorumluPersonelId === selectedPersonnel.id)
    : null;

  const activeStay = selectedPersonnel
    ? kampKayitlari.find((k) => k.personelId === selectedPersonnel.id && k.durum === 'AKTIF')
    : null;
  const activeRoom = activeStay
    ? kampOdalari.find((r) => r.id === activeStay.odaId || r.id === activeStay.roomId)
    : null;

  const personelStayHistory = useMemo(() => {
    if (!selectedPersonnel) return [] as KampKaydi[];
    const fullName = `${selectedPersonnel.ad} ${selectedPersonnel.soyad}`.trim().toLowerCase();
    return kampKayitlari
      .filter((k) =>
        (k.personelId && k.personelId === selectedPersonnel.id) ||
        k.personelIsim.trim().toLowerCase() === fullName
      )
      .sort((a, b) => (b.girisTarihi || '').localeCompare(a.girisTarihi || ''));
  }, [selectedPersonnel, kampKayitlari]);

  const personelIzinBelgeleri = useMemo(() => {
    if (!selectedPersonnel) return [] as PersonelIzinBelgesi[];
    const fullName = `${selectedPersonnel.ad} ${selectedPersonnel.soyad}`.trim().toLocaleLowerCase('tr-TR');
    return izinBelgeleri
      .filter(
        (b) =>
          b.personelId === selectedPersonnel.id ||
          (b.personelIsim || '').trim().toLocaleLowerCase('tr-TR') === fullName
      )
      .sort((a, b) => String(b.baslangicTarihi || '').localeCompare(String(a.baslangicTarihi || '')));
  }, [izinBelgeleri, selectedPersonnel]);

  const personelSahaFaaliyetleri = useMemo(() => {
    if (!selectedPersonnel) return [] as SahaFaaliyeti[];
    const normalizedSelectedName = normalizeTurkishName(`${selectedPersonnel.ad} ${selectedPersonnel.soyad}`);
    return sahaFaaliyetleri
      .filter((f) => {
        if (f.personelId === selectedPersonnel.id) return true;
        return (f.aktifPersonelListesi || []).some(
          (n) => normalizeTurkishName(String(n)) === normalizedSelectedName
        );
      })
      .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || ''), 'tr'));
  }, [selectedPersonnel, sahaFaaliyetleri]);

  const personelTutanaklar = useMemo(() => {
    if (!selectedPersonnel) return [] as HazirTutanak[];
    return hazirTutanaklar
      .filter((t) => t.personelId === selectedPersonnel.id)
      .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''));
  }, [selectedPersonnel, hazirTutanaklar]);

  /* ── Devam Takvim Verisi ── */
  const devamData = useMemo(() => {
    if (!selectedPersonnel) return [];
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const firstWeekday = new Date(selectedYear, selectedMonth - 1, 1).getDay();
    // Pazartesi'den başlayan offset
    const offset = (firstWeekday + 6) % 7;
    const cells: Array<{ day: number; durum: string; mesai: number } | null> = [
      ...Array(offset).fill(null),
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      const data = getYoklamaDay(yoklamalar[selectedPersonnel.id], selectedYear, selectedMonth, d) || { durum: 'Girilmedi', mesaiSaati: 0 };
      cells.push({ day: d, durum: (data as any).durum || 'Girilmedi', mesai: (data as any).mesaiSaati || 0 });
    }
    return cells;
  }, [selectedPersonnel, yoklamalar, selectedYear, selectedMonth]);

  /* ── Excel Export (Çoklu veya Tekli) ── */
  const handleExport = async (persIds: string[]) => {
    const { createExcelWorkbook } = await import('../lib/exceljsLoader');
    const wb = await createExcelWorkbook();

    for (const pid of persIds) {
      const p = personeller.find((x) => x.id === pid);
      if (!p) continue;
      const ws = wb.addWorksheet(`${p.ad} ${p.soyad}`.slice(0, 30));
      const addSection = (title: string) => {
        ws.addRow([]);
        const row = ws.addRow([title]);
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      };
      const addHeader = (...cols: string[]) => {
        const row = ws.addRow(cols);
        row.font = { bold: true };
      };
      ws.addRow(['Personel Detay Raporu', `${p.ad} ${p.soyad}`]);
      ws.addRow(['Rapor Dönemi', `${AY_ADLARI[selectedMonth]} ${selectedYear}`]);
      ws.addRow(['Oluşturma', new Date().toLocaleString('tr-TR')]);

      addSection('KİMLİK BİLGİLERİ');
      addHeader('Alan', 'Değer');
      [
        ['Ad Soyad', `${p.ad} ${p.soyad}`],
        ['Görev', p.gorev || ''],
        ['Firma', getFirmaLabel(p)],
        ['Telefon', p.telefonNo || ''],
        ['E-posta', p.eposta || ''],
        ['TC', p.tcNo || ''],
        ['Adres', `${p.ilce || ''} / ${p.il || ''}`],
        ['İşe Giriş', p.iseGirisTarihi || ''],
        ['İşten Çıkış', p.istenCikisTarihi || '-'],
        ['Maaş', `${(p.maas || 0).toLocaleString('tr-TR')} TL`],
        ['SGK', p.sgkDurumu || ''],
        ['IBAN', p.ibanNo || ''],
        ['Banka', p.bankaAdi || ''],
        ['Durum', isPersonelAktif(p) ? 'Aktif' : 'Pasif'],
      ].forEach(([a, b]) => ws.addRow([a, b]));

      const fIn = getFinansalDetay(p);
      addSection('HAKEDİŞ & FİNANS');
      addHeader('Kalem', 'Değer');
      [
        ['Çalışılan Gün', `${fIn.workedDays}`],
        ['Mesai Saati', `${fIn.totalMesaiSaat}`],
        ['İzinli Gün', `${fIn.izinliGun}`],
        ['Devamsız Gün', `${fIn.yokGun}`],
        ['Kazanılan Hakediş', `${fIn.grossEarned.toLocaleString('tr-TR')} TL`],
        ['Dağıtılan Avans', `${fIn.totalAvans.toLocaleString('tr-TR')} TL`],
        ['Kalan Net Alacak', `${fIn.netAlacak.toLocaleString('tr-TR')} TL`],
      ].forEach(([a, b]) => ws.addRow([a, b]));

      addSection('YOKLAMA KAYITLARI');
      addHeader('Tarih', 'Durum', 'Mesai Saati');
      const personMap = asYoklamaGunMap(yoklamalar[p.id]);
      if (personMap) {
        Object.entries(personMap)
          .map(([key, data]) => {
            const parsed = parseYoklamaDateKey(key);
            const tarih = parsed
              ? `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`
              : key;
            return { tarih, data };
          })
          .sort((a, b) => a.tarih.localeCompare(b.tarih, 'tr'))
          .forEach(({ tarih, data }) => {
            if (!data?.durum || data.durum === 'Girilmedi') return;
            ws.addRow([tarih, data.durum, String((data as any).mesaiSaati ?? '')]);
          });
      }

      addSection('SAHA FAALİYETLERİ');
      addHeader('Tarih', 'İş Niteliği', 'Parsel', 'Blok', 'Açıklama');
      const pSaha = sahaFaaliyetleri.filter((f) => {
        if (f.personelId === p.id) return true;
        const n = `${p.ad} ${p.soyad}`.trim().toLowerCase();
        return (f.aktifPersonelListesi || []).some((x) => String(x).trim().toLowerCase() === n);
      });
      pSaha.forEach((f) =>
        ws.addRow([f.tarih, f.isNiteligi || '', f.parsel || '', f.blok || '', f.aciklama || ''])
      );

      addSection('KAMP / LOJMAN');
      addHeader('Yerleşke', 'Oda', 'Giriş', 'Çıkış', 'Durum');
      kampKayitlari
        .filter((k) => k.personelId === p.id || k.personelIsim?.trim().toLowerCase() === `${p.ad} ${p.soyad}`.toLowerCase())
        .forEach((k) => {
          const room = kampOdalari.find((r) => r.id === k.odaId || r.id === k.roomId);
          ws.addRow([
            room?.yerleskeAdi || k.yerleskeAdi || '',
            room ? `${room.kogusNo} / Oda ${room.odaNo}` : k.odaNo || '',
            k.girisTarihi || '', k.cikisTarihi || '', k.durum || '',
          ]);
        });

      addSection('İZİN BELGELERİ');
      addHeader('İzin Tipi', 'Başlangıç', 'Bitiş', 'Gün', 'Durum');
      const pIzin = izinBelgeleri.filter(
        (b) =>
          b.personelId === p.id ||
          (b.personelIsim || '').trim().toLowerCase() === `${p.ad} ${p.soyad}`.toLowerCase()
      );
      pIzin.forEach((b) =>
        ws.addRow([
          (b.izinTipi || '').replace(/_/g, ' '),
          b.baslangicTarihi || '',
          b.bitisTarihi || '',
          b.toplamGun || 1,
          b.onayDurumu || '',
        ])
      );

      addSection('KASA / AVANS');
      addHeader('Tarih', 'Tutar', 'Açıklama');
      fIn.avansHareketleri.forEach((k) =>
        ws.addRow([k.tarih || '', k.tutar, k.aciklama || ''])
      );

      ws.columns = [{ width: 20 }, { width: 26 }, { width: 16 }, { width: 16 }, { width: 32 }];
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = persIds.length > 1
      ? `Personel_Toplu_Rapor_${AY_ADLARI[selectedMonth]}_${selectedYear}.xlsx`
      : `Personel_${personeller.find((p) => p.id === persIds[0])?.ad}_${selectedYear}-${selectedMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── RENDER ── */
  if (personeller.length === 0) {
    return (
      <div className="flex-grow p-6 min-h-[calc(100vh-52px)] flex items-center justify-center">
        <div className="text-center space-y-3 text-slate-400">
          <Sparkles size={48} className="mx-auto animate-pulse" />
          <p className="text-sm font-bold">Kayıtlı personel bulunmuyor.</p>
          <p className="text-xs">Personel Yönetimi menüsünden ekleyin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow flex h-[calc(100vh-52px)] overflow-hidden font-sans select-none bg-slate-100">

      {/* ═══════════════════════════════════════
          SOL PANEL — Personel Listesi
      ═══════════════════════════════════════ */}
      <div className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col shadow-sm">

        {/* Başlık */}
        <div className="p-3 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/10 rounded-lg">
              <Users size={16} className="text-white" />
            </div>
            <div>
              <p className="text-[9px] font-black tracking-widest text-slate-400 uppercase">Personel Kartları</p>
              <p className="text-xs font-bold text-white">Şantiye Kadrosu</p>
            </div>
          </div>
        </div>

        {/* Arama */}
        <div className="p-2 border-b border-slate-100">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="İsim veya görev ara..."
              className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Filtreler */}
        <div className="px-2 py-1.5 border-b border-slate-100 space-y-1.5">
          <select
            value={firmaFilter}
            onChange={(e) => setFirmaFilter(e.target.value)}
            className="w-full text-[10px] font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
          >
            <option value="HEPSI">🏢 Tüm Firmalar</option>
            {firmaOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={gorevFilter}
            onChange={(e) => setGorevFilter(e.target.value)}
            className="w-full text-[10px] font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
          >
            <option value="HEPSI">👷 Tüm Görevler</option>
            {gorevOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div className="flex gap-1">
            {(['AKTIF', 'PASIF', 'HEPSI'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurumFilter(d)}
                className={`flex-1 text-[9px] font-black py-1 rounded-lg transition ${
                  durumFilter === d
                    ? d === 'AKTIF' ? 'bg-emerald-600 text-white' : d === 'PASIF' ? 'bg-rose-500 text-white' : 'bg-slate-700 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {d === 'AKTIF' ? 'Aktif' : d === 'PASIF' ? 'Pasif' : 'Tümü'}
              </button>
            ))}
          </div>
        </div>

        {/* Toplu Seçim Header */}
        <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={toggleSelectAll} className="text-slate-500 hover:text-indigo-600 cursor-pointer">
              {selectedIds.size > 0 && selectedIds.size === filteredPersoneller.length
                ? <CheckSquare size={13} className="text-indigo-600" />
                : <Square size={13} />}
            </button>
            <span className="text-[9px] text-slate-500 font-semibold">
              {filteredPersoneller.length} personel
              {selectedIds.size > 0 && ` · ${selectedIds.size} seçili`}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => handleExport(Array.from(selectedIds))}
              className="text-[8px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5 hover:bg-emerald-700 cursor-pointer"
            >
              <Download size={9} /> Excel
            </button>
          )}
        </div>

        {/* Personel Listesi */}
        <div className="flex-1 overflow-y-auto">
          {filteredPersoneller.length === 0 ? (
            <div className="p-4 text-center text-[10px] text-slate-400 italic">
              Filtre sonucu boş. Filtreleri değiştirin.
            </div>
          ) : (
            filteredPersoneller.map((p) => {
              const isSelected = p.id === selectedPersId;
              const isChecked  = selectedIds.has(p.id);
              const aktif      = isPersonelAktif(p);
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPersId(p.id)}
                  className={`flex items-center gap-2 px-2 py-2 cursor-pointer border-b border-slate-50 transition-all ${
                    isSelected
                      ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                      : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                    className="shrink-0 text-slate-400 hover:text-indigo-600 cursor-pointer"
                  >
                    {isChecked
                      ? <CheckSquare size={12} className="text-indigo-600" />
                      : <Square size={12} />}
                  </button>

                  {/* Avatar */}
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white ${
                    aktif ? 'bg-gradient-to-br from-indigo-500 to-indigo-700' : 'bg-slate-400'
                  }`}>
                    {p.ad[0]}{p.soyad[0]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-bold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                      {p.ad} {p.soyad}
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">{p.gorev || '—'}</p>
                  </div>

                  <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${aktif ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
              );
            })
          )}
        </div>

        {/* Alt bar - Ay/Yıl Seçici */}
        <div className="p-2 border-t border-slate-200 bg-slate-50 flex gap-1">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="flex-1 text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-1.5 py-1.5 outline-none"
          >
            {AY_ADLARI.slice(1).map((a, i) => (
              <option key={i + 1} value={i + 1}>{a}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-16 text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-1 py-1.5 outline-none"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SAĞ PANEL — Detay Görünümü
      ═══════════════════════════════════════ */}
      {selectedPersonnel ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── Personel Header Bar ── */}
          <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-sm font-black text-white shadow-sm">
                {selectedPersonnel.ad[0]}{selectedPersonnel.soyad[0]}
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  {selectedPersonnel.ad} {selectedPersonnel.soyad}
                </h2>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-semibold text-slate-500">{selectedPersonnel.gorev}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold text-slate-500">{getFirmaLabel(selectedPersonnel)}</span>
                  <span className={`px-1.5 py-0.5 rounded-full font-black text-[8px] ${
                    isPersonelAktif(selectedPersonnel)
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}>
                    {isPersonelAktif(selectedPersonnel) ? '● AKTİF' : '● PASİF'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-slate-500">
                {AY_ADLARI[selectedMonth]} {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => handleExport([selectedPersonnel.id])}
                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer"
              >
                <FileSpreadsheet size={12} />
                Raporla
              </button>
            </div>
          </div>

          {/* ── Sekmeler ── */}
          <div className="bg-white border-b border-slate-200 px-4 flex gap-0.5 shrink-0 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-bold whitespace-nowrap border-b-2 transition cursor-pointer ${
                  selectedTab === t.key
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab İçerikleri ── */}
          <div className="flex-1 overflow-y-auto bg-slate-50">

            {/* ══════ TAB: ÖZET ══════ */}
            {selectedTab === 'ozet' && (
              <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Kimlik */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <User size={11} className="text-indigo-500" /> Kimlik Bilgileri
                  </h3>
                  {[
                    ['TC Kimlik', selectedPersonnel.tcNo || '-'],
                    ['Telefon', selectedPersonnel.telefonNo || '-'],
                    ['E-posta', selectedPersonnel.eposta || '-'],
                    ['Adres', [selectedPersonnel.ilce, selectedPersonnel.il].filter(Boolean).join(' / ') || '-'],
                    ['İşe Giriş', selectedPersonnel.iseGirisTarihi || '-'],
                    ['Kıdem', selectedPersonnel.iseGirisTarihi
                      ? `${Math.floor((Date.now() - new Date(selectedPersonnel.iseGirisTarihi).getTime()) / (365.25 * 24 * 3600 * 1000))} yıl`
                      : '-'],
                    ['SGK', selectedPersonnel.sgkDurumu || '-'],
                    ['Banka / IBAN', `${selectedPersonnel.bankaAdi || '-'} · ${selectedPersonnel.ibanNo ? selectedPersonnel.ibanNo.slice(-8) + '...' : '-'}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center text-xs border-b border-slate-50 pb-1">
                      <span className="text-slate-500 font-medium">{k}</span>
                      <span className="font-semibold text-slate-800 text-right max-w-[160px] truncate">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Finansal özet */}
                <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <Banknote size={11} className="text-amber-400" /> Hakediş & Alacak · {AY_ADLARI[selectedMonth]}
                  </h3>
                  {fin && (
                    <div className="space-y-2 text-xs">
                      {[
                        { label: 'Aylık Net Maaş', val: `${selectedPersonnel.maas.toLocaleString('tr-TR')} TL`, cls: 'text-white' },
                        { label: 'Çalışılan Gün', val: `${fin.workedDays} / ${fin.daysInMonth}`, cls: 'text-white' },
                        { label: 'Mesai Saati', val: `${fin.totalMesaiSaat} saat`, cls: 'text-amber-300' },
                        { label: 'İzinli Gün', val: `${fin.izinliGun}`, cls: 'text-sky-300' },
                        { label: 'Devamsız Gün', val: `${fin.yokGun}`, cls: 'text-rose-400' },
                        { label: 'Kazanılan Hakediş', val: `${fin.grossEarned.toLocaleString('tr-TR')} TL`, cls: 'text-emerald-400' },
                        { label: 'Dağıtılan Avans', val: `${fin.totalAvans.toLocaleString('tr-TR')} TL`, cls: 'text-rose-400' },
                      ].map(({ label, val, cls }) => (
                        <div key={label} className="flex justify-between border-b border-slate-800 pb-1">
                          <span className="text-slate-400">{label}</span>
                          <span className={`font-bold font-mono ${cls}`}>{val}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[11px] font-black text-amber-400">KALAN NET ALACAK</span>
                        <span className="text-base font-black font-mono text-amber-400">
                          {fin.netAlacak.toLocaleString('tr-TR')} TL
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tahsisler */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <Briefcase size={11} className="text-purple-500" /> Şantiye Tahsisleri
                  </h3>
                  {assignedVehicle ? (
                    <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                      <div className="p-2 bg-slate-100 rounded-lg"><Truck size={14} className="text-slate-700" /></div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Tahsisli Araç</p>
                        <p className="text-xs font-bold text-slate-900">{assignedVehicle.plaka} — {assignedVehicle.markaModel}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic">Araç tahsisi yok</p>
                  )}
                  {activeRoom ? (
                    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                      <div className="p-2 bg-emerald-100 rounded-lg"><Tent size={14} className="text-emerald-700" /></div>
                      <div>
                        <p className="text-[9px] font-black text-emerald-600 uppercase">Aktif Lojman</p>
                        <p className="text-xs font-bold text-slate-900">
                          {activeRoom.yerleskeAdi} / {activeRoom.kogusNo} / Oda {activeRoom.odaNo}
                        </p>
                      </div>
                    </div>
                  ) : activeStay ? (
                    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                      <div className="p-2 bg-emerald-100 rounded-lg"><Tent size={14} className="text-emerald-700" /></div>
                      <div>
                        <p className="text-[9px] font-black text-emerald-600 uppercase">Aktif Lojman</p>
                        <p className="text-xs font-bold text-slate-900">
                          {activeStay.yerleskeAdi} / Oda {activeStay.odaNo || '-'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic">Kamp / lojman kaydı yok</p>
                  )}
                </div>

                {/* Özet sayaçlar */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5 mb-3">
                    <BarChart3 size={11} className="text-indigo-500" /> Bu Ayki Özet
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Saha Faaliyeti', val: personelSahaFaaliyetleri.filter((f) => (f.tarih || '').startsWith(`${selectedYear}-${String(selectedMonth).padStart(2,'0')}`)).length, icon: '⛏️', color: 'bg-amber-50 border-amber-200 text-amber-700' },
                      { label: 'İzin Belgesi', val: personelIzinBelgeleri.length, icon: '📋', color: 'bg-sky-50 border-sky-200 text-sky-700' },
                      { label: 'Tutanak', val: personelTutanaklar.length, icon: '📄', color: 'bg-purple-50 border-purple-200 text-purple-700' },
                      { label: 'Lojman Geçmişi', val: personelStayHistory.length, icon: '🏕️', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                    ].map(({ label, val, icon, color }) => (
                      <div key={label} className={`border rounded-xl p-3 text-center ${color}`}>
                        <p className="text-xl font-black">{val}</p>
                        <p className="text-[9px] font-bold mt-0.5">{icon} {label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══════ TAB: DEVAM ══════ */}
            {selectedTab === 'devam' && (
              <div className="p-5 space-y-4">
                {/* Legend */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                      <Calendar size={11} className="text-emerald-500" />
                      Aylık Devam Takvimi — {AY_ADLARI[selectedMonth]} {selectedYear}
                    </h3>
                    <div className="flex gap-2">
                      {[['Geldi','bg-emerald-500'],['Yok','bg-rose-500'],['İzinli','bg-sky-400'],['Raporlu','bg-amber-400'],['Tatil','bg-slate-200']].map(([l,c]) => (
                        <span key={l} className="flex items-center gap-1 text-[8px] font-bold text-slate-600">
                          <span className={`w-2 h-2 rounded-sm ${c}`} />{l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Gün başlıkları */}
                  <div className="grid grid-cols-7 gap-1.5 mb-1">
                    {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((d) => (
                      <div key={d} className="text-center text-[8px] font-black text-slate-400 uppercase">{d}</div>
                    ))}
                  </div>
                  {/* Takvim hücreleri */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {devamData.map((cell, i) => {
                      if (!cell) return <div key={i} />;
                      const meta = getDayStatusMeta(cell.durum);
                      return (
                        <div
                          key={i}
                          title={`${cell.day} ${AY_ADLARI[selectedMonth]} — ${cell.durum}${cell.mesai ? ` · ${cell.mesai}h mesai` : ''}`}
                          className={`h-10 rounded-lg flex flex-col items-center justify-center ${meta.cls} border border-white/20 shadow-sm`}
                        >
                          <span className="text-[8px] opacity-70">{cell.day}</span>
                          <span className="text-[9px] font-black">{meta.short}</span>
                          {cell.mesai > 0 && <span className="text-[6px] opacity-80">{cell.mesai}h</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Devamsızlık İstatistikleri */}
                {fin && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Çalışılan', val: fin.workedDays, unit: 'gün', color: 'from-emerald-500 to-emerald-600' },
                      { label: 'Devamsız', val: fin.yokGun, unit: 'gün', color: 'from-rose-500 to-rose-600' },
                      { label: 'İzinli', val: fin.izinliGun, unit: 'gün', color: 'from-sky-500 to-sky-600' },
                      { label: 'Toplam Mesai', val: fin.totalMesaiSaat, unit: 'saat', color: 'from-amber-500 to-amber-600' },
                    ].map(({ label, val, unit, color }) => (
                      <div key={label} className={`bg-gradient-to-br ${color} text-white rounded-2xl p-4 shadow-sm`}>
                        <p className="text-2xl font-black">{val}</p>
                        <p className="text-[9px] font-bold opacity-80 mt-0.5">{unit}</p>
                        <p className="text-[10px] font-black mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════ TAB: MESAİ ══════ */}
            {selectedTab === 'mesai' && (
              <div className="p-5 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5 mb-4">
                    <Clock size={11} className="text-amber-500" /> Mesai Detayları — {AY_ADLARI[selectedMonth]} {selectedYear}
                  </h3>
                  {/* Günlük mesai tablosu */}
                  <div className="space-y-1">
                    {devamData.filter(Boolean).filter((c) => c && c.durum === 'Geldi' && c.mesai > 0).length === 0 ? (
                      <div className="h-20 border border-dashed rounded-xl flex items-center justify-center text-[10px] text-slate-400 italic">
                        Bu ay için mesai saati kaydı bulunmuyor.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="text-left text-[9px] font-black text-slate-400 uppercase pb-2">Tarih</th>
                              <th className="text-left text-[9px] font-black text-slate-400 uppercase pb-2">Durum</th>
                              <th className="text-right text-[9px] font-black text-slate-400 uppercase pb-2">Mesai (saat)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {devamData.filter(Boolean).filter((c) => c && c.mesai > 0).map((c, i) => (
                              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="py-1.5 font-mono text-slate-700">
                                  {String(c!.day).padStart(2,'0')} {AY_ADLARI[selectedMonth]}
                                </td>
                                <td>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${getDayStatusMeta(c!.durum).cls}`}>
                                    {c!.durum}
                                  </span>
                                </td>
                                <td className="text-right font-bold text-amber-600">{c!.mesai}h</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200">
                              <td colSpan={2} className="pt-2 font-black text-slate-700 text-xs">TOPLAM</td>
                              <td className="pt-2 text-right font-black text-amber-600">
                                {devamData.filter(Boolean).reduce((acc, c) => acc + (c?.mesai || 0), 0)}h
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Saha faaliyetlerindeki mesai */}
                {personelSahaFaaliyetleri.filter((f) => f.faaliyetTipi === 'MESAI_SAHA').length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                    <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                      <Star size={11} className="text-amber-500" /> Saha Mesai Faaliyetleri
                    </h3>
                    {personelSahaFaaliyetleri
                      .filter((f) => f.faaliyetTipi === 'MESAI_SAHA')
                      .slice(0, 10)
                      .map((f) => (
                        <div key={f.id} className="border border-amber-100 bg-amber-50 rounded-xl p-2.5 text-xs">
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-800">{f.isNiteligi}</span>
                            <span className="font-mono text-slate-500 text-[10px]">{f.tarih}</span>
                          </div>
                          <p className="text-slate-600 text-[10px] mt-0.5">{f.parsel} / {f.blok} · {f.aciklama}</p>
                          {f.personelMesaiSaatleri?.[selectedPersonnel.id] && (
                            <span className="text-[9px] font-black text-amber-700">
                              {f.personelMesaiSaatleri[selectedPersonnel.id]}h mesai
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════ TAB: ÖDEME ══════ */}
            {selectedTab === 'odeme' && (
              <div className="p-5 space-y-4">
                {/* Maaş Özet */}
                <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 shadow-sm">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase mb-4">
                    💵 Ödeme Bilgileri — {AY_ADLARI[selectedMonth]} {selectedYear}
                  </h3>
                  {fin && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {[
                        ['Aylık Brüt Maaş', `${selectedPersonnel.maas.toLocaleString('tr-TR')} TL`, 'text-white'],
                        ['Çalışılan Gün', `${fin.workedDays}`, 'text-white'],
                        ['Kazanılan Hakediş', `${fin.grossEarned.toLocaleString('tr-TR')} TL`, 'text-emerald-400'],
                        ['Dağıtılan Avans', `${fin.totalAvans.toLocaleString('tr-TR')} TL`, 'text-rose-400'],
                        ['Kalan Alacak', `${fin.netAlacak.toLocaleString('tr-TR')} TL`, 'text-amber-400 font-black text-base'],
                        ['IBAN', selectedPersonnel.ibanNo ? `...${selectedPersonnel.ibanNo.slice(-10)}` : '-', 'text-slate-300'],
                      ].map(([l, v, c]) => (
                        <div key={l} className="border-b border-slate-800 pb-2">
                          <p className="text-slate-500 text-[9px]">{l}</p>
                          <p className={`font-bold font-mono ${c}`}>{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Avans Hareketleri */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <CreditCard size={11} className="text-rose-500" /> Avans & Kasa Hareketleri
                  </h3>
                  {fin && fin.avansHareketleri.length === 0 ? (
                    <div className="h-16 border border-dashed rounded-xl flex items-center justify-center text-[10px] text-slate-400 italic">
                      Kayıtlı avans / ödeme hareketi yok.
                    </div>
                  ) : fin ? (
                    <div className="space-y-1.5">
                      {fin.avansHareketleri.map((k) => (
                        <div key={k.id} className="flex items-center justify-between border border-rose-100 bg-rose-50 rounded-xl px-3 py-2 text-xs">
                          <div>
                            <p className="font-bold text-slate-800">{k.aciklama || 'Avans / Ödeme'}</p>
                            <p className="text-[9px] text-slate-500 font-mono">{k.tarih}</p>
                          </div>
                          <span className="font-black text-rose-600 font-mono">-{k.tutar.toLocaleString('tr-TR')} TL</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Maaş Ödeme Geçmişi */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <TrendingUp size={11} className="text-emerald-500" /> Maaş Ödeme Geçmişi
                  </h3>
                  {fin && fin.maasGecmis.length === 0 ? (
                    <div className="h-16 border border-dashed rounded-xl flex items-center justify-center text-[10px] text-slate-400 italic">
                      Kayıtlı maaş ödeme geçmişi yok.
                    </div>
                  ) : fin ? (
                    <div className="space-y-2">
                      {fin.maasGecmis.slice(0, 12).map((m) => (
                        <div key={m.id} className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs border ${
                          m.odendi ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                        }`}>
                          <div>
                            <p className="font-bold text-slate-800">{AY_ADLARI[m.ay]} {m.yil}</p>
                            <p className="text-[9px] text-slate-500">{m.odemeTarihi ? `Ödendi: ${m.odemeTarihi}` : 'Henüz ödenmedi'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black font-mono text-slate-900">{m.netOdeme.toLocaleString('tr-TR')} TL</p>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                              m.odendi ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {m.odendi ? '✓ Ödendi' : '⏳ Bekliyor'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* ══════ TAB: KAMP ══════ */}
            {selectedTab === 'kamp' && (
              <div className="p-5 space-y-4">
                {/* Aktif yerleşim */}
                <div className={`rounded-2xl border p-4 shadow-sm ${
                  activeRoom || activeStay ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                }`}>
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5 mb-3">
                    <Tent size={11} className="text-emerald-600" /> Aktif Kamp Yerleşimi
                  </h3>
                  {activeRoom ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-600 text-white rounded-xl"><Tent size={20} /></div>
                        <div>
                          <p className="text-[9px] text-emerald-700 font-black uppercase">Aktif — Konaklıyor</p>
                          <p className="text-lg font-black text-slate-900">{activeRoom.yerleskeAdi}</p>
                          <p className="text-slate-600 font-semibold">{activeRoom.kogusNo} / Oda {activeRoom.odaNo}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Giriş: {activeStay?.girisTarihi || '-'}</p>
                        </div>
                      </div>
                    </div>
                  ) : activeStay ? (
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-slate-800">{activeStay.yerleskeAdi} / Oda {activeStay.odaNo || '-'}</p>
                      <p className="text-slate-500">Giriş: {activeStay.girisTarihi}</p>
                    </div>
                  ) : (
                    <div className="h-16 border border-dashed border-emerald-300 rounded-xl flex items-center justify-center text-[10px] text-emerald-600 italic">
                      Aktif kamp / lojman kaydı yok.
                    </div>
                  )}
                </div>

                {/* Konaklama Geçmişi */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <Clock size={11} className="text-slate-500" /> Konaklama Geçmişi ({personelStayHistory.length} kayıt)
                  </h3>
                  {personelStayHistory.length === 0 ? (
                    <div className="h-16 border border-dashed rounded-xl flex items-center justify-center text-[10px] text-slate-400 italic">
                      Konaklama geçmişi yok.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {personelStayHistory.map((k) => {
                        const room = kampOdalari.find((r) => r.id === k.odaId || r.id === k.roomId);
                        const roomText = room
                          ? `${room.yerleskeAdi} / ${room.kogusNo} / Oda ${room.odaNo}`
                          : `${k.yerleskeAdi || '-'} / Oda ${k.odaNo || '-'}`;
                        return (
                          <div key={k.id} className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs border ${
                            k.durum === 'AKTIF'
                              ? 'bg-emerald-50 border-emerald-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}>
                            <div>
                              <p className="font-bold text-slate-800">{roomText}</p>
                              <p className="text-[9px] text-slate-500 font-mono">
                                {k.girisTarihi} {k.cikisTarihi ? `→ ${k.cikisTarihi}` : '→ (Devam ediyor)'}
                              </p>
                            </div>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                              k.durum === 'AKTIF' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {k.durum}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════ TAB: SAHA ══════ */}
            {selectedTab === 'saha' && (
              <div className="p-5 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                      <Activity size={11} className="text-amber-600" /> Saha Faaliyetleri ({personelSahaFaaliyetleri.length})
                    </h3>
                  </div>
                  {personelSahaFaaliyetleri.length === 0 ? (
                    <div className="h-24 border border-dashed rounded-xl flex items-center justify-center text-[10px] text-slate-400 italic">
                      Saha faaliyet kaydı yok.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {personelSahaFaaliyetleri.slice(0, 30).map((f) => (
                        <div key={f.id} className={`border rounded-xl p-3 text-xs ${
                          f.faaliyetTipi === 'MESAI_SAHA'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-bold text-slate-900 truncate">{f.isNiteligi}</p>
                                {f.faaliyetTipi === 'MESAI_SAHA' && (
                                  <span className="text-[8px] font-black bg-amber-200 text-amber-800 px-1 rounded">MESAİ</span>
                                )}
                                {f.isEtiketi && (
                                  <span className="text-[8px] font-black bg-indigo-100 text-indigo-700 px-1 rounded">{f.isEtiketi}</span>
                                )}
                              </div>
                              <p className="text-slate-600 text-[10px] mt-0.5">{f.aciklama}</p>
                              <div className="flex gap-2 mt-1 text-[9px] text-slate-500">
                                {f.parsel && <span>📍 {f.parsel}</span>}
                                {f.blok && <span>🧱 {f.blok}</span>}
                                {f.kaynakEkran && <span className="text-slate-400">Kaynak: {f.kaynakEkran}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[9px] font-mono text-slate-500">{f.tarih}</p>
                              {f.personelMesaiSaatleri?.[selectedPersonnel.id] && (
                                <p className="text-[9px] font-black text-amber-600">
                                  {f.personelMesaiSaatleri[selectedPersonnel.id]}h
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {personelSahaFaaliyetleri.length > 30 && (
                        <p className="text-[10px] text-slate-400 text-center italic">
                          +{personelSahaFaaliyetleri.length - 30} daha fazla kayıt var. Excel raporu alın.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════ TAB: BELGELER ══════ */}
            {selectedTab === 'belgeler' && (
              <div className="p-5 space-y-4">
                {/* İzin Belgeleri */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <ClipboardList size={11} className="text-sky-500" />
                    İzin Belgeleri {izinLoading && <RefreshCw size={10} className="animate-spin text-slate-400" />}
                    <span className="ml-auto text-[8px] font-bold text-slate-400 normal-case">
                      {personelIzinBelgeleri.length} belge
                    </span>
                  </h3>
                  {personelIzinBelgeleri.length === 0 ? (
                    <div className="h-16 border border-dashed rounded-xl flex items-center justify-center text-[10px] text-slate-400 italic">
                      İzin belgesi yok.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {personelIzinBelgeleri.map((b) => (
                        <div key={b.id} className="border border-sky-100 bg-sky-50/40 rounded-xl p-3 flex items-center justify-between text-xs">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900">{(b.izinTipi || 'İZİN').replace(/_/g, ' ')}</p>
                            <p className="text-[9px] text-slate-500 font-mono">
                              {b.baslangicTarihi} → {b.bitisTarihi} · {b.toplamGun || 1} gün
                            </p>
                            {b.aciklama && <p className="text-[9px] text-slate-500">{b.aciklama}</p>}
                          </div>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                            b.onayDurumu === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-700' :
                            b.onayDurumu === 'REDDEDİLDİ' ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {b.onayDurumu === 'ONAYLANDI' ? '✓ Onaylı' :
                             b.onayDurumu === 'REDDEDİLDİ' ? '✖ Red' : '⌛ Bekliyor'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tutanaklar */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <Shield size={11} className="text-purple-500" /> Tutanak & Evraklar
                    <span className="ml-auto text-[8px] font-bold text-slate-400 normal-case">
                      {personelTutanaklar.length} tutanak
                    </span>
                  </h3>
                  {personelTutanaklar.length === 0 ? (
                    <div className="h-16 border border-dashed rounded-xl flex items-center justify-center text-[10px] text-slate-400 italic">
                      Tutanak / evrak yok.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {personelTutanaklar.map((t) => (
                        <div key={t.id} className="border border-purple-100 bg-purple-50/40 rounded-xl p-3 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[8px] font-black px-1.5 rounded ${
                                  t.tutanakTipi === 'CEZA' ? 'bg-rose-100 text-rose-700' :
                                  t.tutanakTipi === 'TAHSİS' ? 'bg-indigo-100 text-indigo-700' :
                                  'bg-purple-100 text-purple-700'
                                }`}>
                                  {t.tutanakTipi}
                                </span>
                                <p className="font-bold text-slate-900 truncate">{t.konu}</p>
                              </div>
                              <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                                No: {t.belgeNo} · {t.tarih}
                              </p>
                              {t.aciklama && (
                                <p className="text-[10px] text-slate-600 mt-0.5">{t.aciklama}</p>
                              )}
                            </div>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                              t.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-700' :
                              t.durum === 'İPTAL' ? 'bg-rose-100 text-rose-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {t.durum}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Activity size={14} className="text-emerald-600" />
                Saha Faaliyetleri ({personelSahaFaaliyetleri.length})
              </h4>
              <div className="space-y-2.5">
                {personelSahaFaaliyetleri.length === 0 ? (
                  <div className="h-16 border border-dashed border-slate-100 rounded-xl flex items-center justify-center text-[10px] text-slate-400 font-medium italic">
                    Bu personel için saha faaliyet kaydı yok.
                  </div>
                ) : (
                  personelSahaFaaliyetleri.slice(0, 8).map((f) => (
                    <div key={f.id} className="border border-slate-150 rounded-xl p-3 bg-slate-50/70 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-slate-900 font-semibold truncate">{f.isNiteligi || 'Saha Faaliyeti'}</p>
                          <p className="text-[10px] text-slate-500 mt-1">{f.tarih || '-'}</p>
                          <p className="text-slate-600 text-[11px] mt-2 truncate">{f.aciklama || f.parsel || f.blok || 'Detay yok'}</p>
                        </div>
                        {f.personelMesaiSaatleri?.[selectedPersonnel.id] ? (
                          <span className="text-[10px] font-black text-amber-600">{f.personelMesaiSaatleri[selectedPersonnel.id]}h</span>
                        ) : null}
                      </div>
                      {f.kaynakEkran && (
                        <p className="text-[9px] text-slate-400 mt-2">Kaynak: {f.kaynakEkran}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
          {/* /Tab İçerikleri */}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center space-y-3">
            <Sparkles size={48} className="mx-auto animate-pulse" />
            <p className="text-sm font-bold">Bir personel seçin</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default PersonelKartlariScreen;
