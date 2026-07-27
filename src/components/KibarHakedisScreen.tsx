import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, Calendar, Printer, ShieldCheck, CheckCircle2,
  RefreshCw, UserX
} from 'lucide-react';
import { db, parseYoklamaSnapshotData, saveDocument } from '../lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { Personel, AylikYoklamaMap, SahaKolajFoto, ProgramliFaaliyet, TesisatciFaaliyet, MermerciFaaliyet } from '../types/erp';
import { tesisatciToSaha, mermerciToSaha } from '../lib/mobilFaaliyetAdapter';
import { CorporateReportLayout } from './CorporateReportLayout';
import { buildPersonelListForMonth, isDayActiveForPersonel, normalizeTurkishName } from '../lib/yoklamaUtils';
import { resolveStubPersonelFromLegacyId } from '../lib/legacyYoklamaImport';
import { normalizeGorev } from '../lib/gorevUtils';
import {
  prepareSahaFaaliyetRaporu,
  prepareKampFaaliyetRaporu,
  faaliyetIsTanimi,
  formatPersonelSayisi,
} from '../lib/kibarReportUtils';
import { groupKolajFotolari, mergeAlbumFotolari } from '../lib/sahaKolajUtils';

interface KibarHakedisScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  sahaFaaliyetleri: any[];
  programliFaaliyetler?: ProgramliFaaliyet[];
  currentUser: any;
}

interface StaffHakedisRow {
  personel: Personel;
  geldiGun: number;
  mesaiSaat: number;
  gunKazanci: number;
  mesaiKazanci: number;
  toplamKazanc: number;
  zerYapiHakedis: number;
}

const ZER_YAPI_GUNLUK = 200;

/** Ekran önizleme + yazdırma — naif gri/beyaz rapor stili */
const REPORT_CSS = `
  .rpt-header { border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden; }
  .rpt-header-main {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 12px; border-bottom: 1px solid #e5e7eb; background: #fff;
  }
  .rpt-header-brand { display: flex; align-items: center; gap: 12px; }
  .rpt-header-brand h2 {
    margin: 0; font-size: 10pt; font-weight: 800; color: #1f2937;
    text-transform: uppercase; letter-spacing: 0.02em;
  }
  .rpt-header-brand p {
    margin: 2px 0 0; font-size: 7pt; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .rpt-header-meta { text-align: right; }
  .rpt-ref {
    display: inline-block; border: 1px solid #d1d5db; background: #f9fafb;
    font-size: 7pt; font-weight: 700; padding: 2px 8px; color: #374151;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .rpt-header-meta p { margin: 4px 0 0; font-size: 7pt; color: #9ca3af; }
  .rpt-header-title {
    text-align: center; padding: 7px 10px; background: #f9fafb;
    border-top: 1px solid #f3f4f6; font-size: 8.5pt; font-weight: 700;
    color: #374151; text-transform: uppercase; letter-spacing: 0.03em;
  }
  .rpt-zer-box {
    border: 1px solid #d1d5db; background: #fafafa; border-radius: 4px;
    padding: 12px 14px; margin: 10px 0; page-break-inside: avoid;
  }
  .rpt-zer-box h4 {
    margin: 0 0 6px; font-size: 8pt; color: #4b5563;
    text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
  }
  .rpt-zer-formula { font-size: 7.5pt; color: #6b7280; margin: 0 0 6px; word-break: break-word; }
  .rpt-zer-total {
    font-size: 17pt; font-weight: 800; color: #047857;
    font-family: Consolas, 'Courier New', monospace;
  }
  .rpt-zer-meta { font-size: 7pt; color: #9ca3af; margin-top: 4px; }
  .rpt-sec-title {
    font-size: 9pt; font-weight: 700; color: #374151;
    text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 3px;
  }
  .rpt-sec-sub { font-size: 7.5pt; color: #9ca3af; margin: 0 0 6px; }
  .rpt-table-wrap { border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden; margin-top: 4px; }
  .report-root { width: 100%; max-width: 277mm; margin: 0 auto; overflow-x: hidden; }
  .rpt-staff-table, .rpt-act-table {
    width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8.5pt;
  }
  .rpt-staff-table th, .rpt-staff-table td,
  .rpt-act-table th, .rpt-act-table td {
    padding: 3px 5px; vertical-align: middle;
    border-bottom: 1px solid #e5e7eb; line-height: 1.25; color: #374151;
    overflow: hidden;
  }
  .rpt-staff-table thead th, .rpt-act-table thead th {
    font-size: 7.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.03em; white-space: nowrap;
    background: #f3f4f6; color: #4b5563;
    border-bottom: 1px solid #d1d5db;
  }
  .rpt-align-c { text-align: center !important; }
  .rpt-align-r { text-align: right !important; }
  .rpt-align-l { text-align: left !important; }
  .rpt-mono { font-family: Consolas, 'Courier New', monospace; font-variant-numeric: tabular-nums; font-size: 7.5pt; }
  .rpt-mono-nowrap { white-space: nowrap; }
  .rpt-name { font-weight: 600; text-transform: uppercase; word-break: break-word; overflow-wrap: anywhere; white-space: normal; color: #1f2937; }
  .rpt-grp-sep { border-left: 1px solid #d1d5db !important; }
  .rpt-th-hakedis { color: #047857 !important; }
  .rpt-td-num { text-align: right; color: #4b5563; }
  .rpt-td-hakedis {
    text-align: right; color: #047857; font-weight: 700;
    background: #f9fafb;
  }
  .rpt-staff-table tbody tr:nth-child(even),
  .rpt-act-table tbody tr:nth-child(even) { background: #fafafa; }
  .rpt-staff-table tbody tr:nth-child(odd),
  .rpt-act-table tbody tr:nth-child(odd) { background: #fff; }
  .rpt-act-table th, .rpt-act-table td { overflow: hidden; }
  .rpt-act-no { width: 4%; }
  .rpt-act-date { width: 10%; white-space: normal; line-height: 1.2; }
  .rpt-act-date-main { display: block; font-family: Consolas, 'Courier New', monospace; font-size: 7.5pt; white-space: nowrap; }
  .rpt-act-date-day { display: block; font-size: 6.5pt; color: #9ca3af; margin-top: 1px; white-space: nowrap; }
  .rpt-act-parsel { width: 9%; white-space: nowrap; text-overflow: ellipsis; font-weight: 600; }
  .rpt-act-blok { width: 7%; white-space: nowrap; text-overflow: ellipsis; }
  .rpt-act-desc {
    white-space: normal; word-break: break-word; overflow-wrap: break-word; line-height: 1.3;
  }
  .rpt-act-pers { width: 10%; white-space: normal; font-size: 7pt; line-height: 1.2; word-break: break-word; }
  .rpt-kamp-date { width: 12%; white-space: normal; }
  .rpt-kamp-tip { width: 15%; white-space: normal; word-break: break-word; }
  .rpt-kamp-desc { white-space: normal; word-break: break-word; overflow-wrap: break-word; }
  .rpt-foot { background: #f3f4f6; font-weight: 700; border-top: 2px solid #d1d5db; color: #374151; }
  .rpt-foot .rpt-td-hakedis { background: #f3f4f6; font-size: 9pt; }
  .rpt-summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .rpt-summary-card {
    border: 1px solid #d1d5db; border-radius: 4px; padding: 10px;
    text-align: center; background: #fafafa;
  }
  .rpt-summary-card span:first-child {
    font-size: 7pt; font-weight: 700; color: #6b7280;
    text-transform: uppercase; display: block;
  }
  .rpt-summary-val { font-size: 11pt; font-weight: 700; color: #374151; font-family: Consolas, monospace; display: block; margin-top: 4px; }
  .rpt-summary-sub { font-size: 6.5pt; color: #9ca3af; display: block; margin-top: 3px; }
  .rpt-summary-hakedis { border-color: #059669; background: #fafafa; }
  .rpt-summary-hakedis span:first-child { color: #047857; }
  .rpt-summary-hakedis .rpt-summary-val { color: #047857; font-size: 13pt; font-weight: 800; }
  .rpt-sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  .rpt-sign-box {
    border: 1px solid #d1d5db; border-radius: 4px; padding: 14px 12px 12px;
    text-align: center; min-height: 96px; background: #fff;
  }
  .rpt-sign-label {
    font-weight: 700; color: #374151; font-size: 8.5pt;
    text-transform: uppercase; letter-spacing: 0.04em; display: block;
  }
  .rpt-sign-space {
    height: 52px; margin: 10px 16px 6px;
    border-bottom: 1px solid #cbd5e1;
  }
  .rpt-sign-hint { font-size: 7.5pt; color: #9ca3af; font-weight: 600; }
  .rpt-eimza {
    border: 1px solid #d1d5db; border-radius: 4px; padding: 12px;
    background: #f9fafb; font-size: 8pt; color: #374151;
  }
  .rpt-foto-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
    margin-top: 6px;
  }
  .rpt-foto-card {
    border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden;
    background: #fff; page-break-inside: avoid;
  }
  .rpt-foto-card img {
    display: block !important; width: 100%; height: 38mm; object-fit: cover;
  }
  .rpt-foto-cap {
    font-size: 6.5pt; color: #4b5563; padding: 3px 4px; line-height: 1.2;
  }
  .rpt-foto-grup {
    font-size: 7.5pt; font-weight: 700; color: #374151;
    text-transform: uppercase; margin: 8px 0 3px;
  }
`;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function calcGunKazanci(personel: Personel, geldiGun: number, year: number, month: number): number {
  if (geldiGun <= 0) return 0;
  const baseWage = personel.maas || 30000;
  return geldiGun * (baseWage / daysInMonth(year, month));
}

function calcMesaiKazanci(personel: Personel, mesaiSaat: number, year: number, month: number): number {
  if (mesaiSaat <= 0) return 0;
  const baseWage = personel.maas || 30000;
  const hourlyWage = baseWage / daysInMonth(year, month) / 7.5;
  return mesaiSaat * hourlyWage * 1.5;
}

function formatMoney(amount: number, fraction = 2): string {
  return `₺${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  })}`;
}

const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function filterByMonth(items: { tarih?: string }[], year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return items.filter(item => (item.tarih || '').startsWith(prefix));
}

function sumStrictMonthAttendance(
  personel: Personel,
  personMap: Record<string, { durum?: string; mesaiSaati?: number }> | undefined,
  year: number,
  month: number
): { geldiGun: number; mesaiSaat: number } {
  if (!personMap) return { geldiGun: 0, mesaiSaat: 0 };
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  let geldiGun = 0;
  let mesaiSaat = 0;

  Object.entries(personMap).forEach(([key, data]) => {
    // Sadece tarih formatlı ve seçili aya ait kayıtlar hesaba katılır.
    if (!key.startsWith(prefix)) return;
    const day = Number(key.slice(prefix.length));
    if (!Number.isFinite(day) || day < 1 || day > 31) return;
    if (!isDayActiveForPersonel(personel, year, month, day, personMap as any)) return;
    if (data?.durum === 'Geldi') geldiGun++;
    mesaiSaat += Number(data?.mesaiSaati || 0);
  });

  return { geldiGun, mesaiSaat };
}

function getStrictMonthKeys(
  personMap: Record<string, { durum?: string; mesaiSaati?: number }> | undefined,
  year: number,
  month: number
): string[] {
  if (!personMap) return [];
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return Object.keys(personMap).filter((k) => k.startsWith(prefix)).sort();
}

export const KibarHakedisScreen: React.FC<KibarHakedisScreenProps> = ({
  personeller,
  yoklamalar,
  sahaFaaliyetleri,
  programliFaaliyetler = [],
  currentUser
}) => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [kampFaaliyetleri, setKampFaaliyetleri] = useState<any[]>([]);
  const [tesisatciFaaliyetleri, setTesisatciFaaliyetleri] = useState<TesisatciFaaliyet[]>([]);
  const [mermerciFaaliyetleri, setMermerciFaaliyetleri] = useState<MermerciFaaliyet[]>([]);
  const [kolajFotolari, setKolajFotolari] = useState<SahaKolajFoto[]>([]);
  const [excludedStaffIds, setExcludedStaffIds] = useState<string[]>([]);
  const [reportType, setReportType] = useState<'NORMAL' | 'E-IMZALI'>('NORMAL');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [yoklamaSource, setYoklamaSource] = useState<AylikYoklamaMap>(yoklamalar);
  const [refreshingYoklama, setRefreshingYoklama] = useState(false);
  const [lastYoklamaRefreshAt, setLastYoklamaRefreshAt] = useState<string | null>(null);

  const donemLabel = `${TURKISH_MONTHS[selectedMonth - 1]} ${selectedYear}`;
  const donemKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  useEffect(() => {
    setYoklamaSource(yoklamalar);
  }, [yoklamalar]);

  useEffect(() => {
    const unsubKamp = onSnapshot(collection(db, 'kampGunlukFaaliyetleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      setKampFaaliyetleri(list);
    });
    const unsubTesisatci = onSnapshot(collection(db, 'tesisatciFaaliyetleri'), (snap) => {
      const list: TesisatciFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TesisatciFaaliyet, 'id'>) }));
      setTesisatciFaaliyetleri(list);
    });
    const unsubMermerci = onSnapshot(collection(db, 'mermerciFaaliyetleri'), (snap) => {
      const list: MermerciFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<MermerciFaaliyet, 'id'>) }));
      setMermerciFaaliyetleri(list);
    });
    return () => {
      unsubKamp();
      unsubTesisatci();
      unsubMermerci();
    };
  }, []);

  // Saha + tesisatçı + mermerci birleşik liste (ZER YAPI Hakediş tüm faaliyetleri kapsar)
  const tumSahaFaaliyetleri = useMemo(
    () => [
      ...(sahaFaaliyetleri || []),
      ...tesisatciFaaliyetleri.map(tesisatciToSaha),
      ...mermerciFaaliyetleri.map(mermerciToSaha),
    ],
    [sahaFaaliyetleri, tesisatciFaaliyetleri, mermerciFaaliyetleri]
  );

  useEffect(() => {
    const q = query(collection(db, 'sahaKolajFotolari'), where('albumKey', '==', donemKey));
    const unsub = onSnapshot(q, (snap) => {
      const list: SahaKolajFoto[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SahaKolajFoto, 'id'>) }));
      list.sort((a, b) => a.sira - b.sira || a.yuklemeTarihi.localeCompare(b.yuklemeTarihi));
      setKolajFotolari(list);
    });
    return () => unsub();
  }, [donemKey]);

  const birlesikKolajFotolari = useMemo(
    () =>
      mergeAlbumFotolari({
        albumKey: donemKey,
        yil: selectedYear,
        ay: selectedMonth,
        kolajFotolari,
        sahaFaaliyetleri: tumSahaFaaliyetleri,
        programliFaaliyetler,
      }),
    [donemKey, selectedYear, selectedMonth, kolajFotolari, tumSahaFaaliyetleri, programliFaaliyetler]
  );

  // Yazdırma performansını korumak için üst sınır; tüm sayım subtitle'da gösterilir
  const HAKEDIS_FOTO_LIMIT = 60;
  const kolajFotoLimit = useMemo(() => {
    const gruplar = groupKolajFotolari(birlesikKolajFotolari);
    const flat: SahaKolajFoto[] = [];
    for (const g of gruplar) {
      for (const f of g.fotolar) {
        if (flat.length >= HAKEDIS_FOTO_LIMIT) break;
        flat.push(f);
      }
      if (flat.length >= HAKEDIS_FOTO_LIMIT) break;
    }
    return flat;
  }, [birlesikKolajFotolari]);

  const monthPersoneller = useMemo(
    () => buildPersonelListForMonth(personeller, yoklamaSource, selectedYear, selectedMonth, resolveStubPersonelFromLegacyId),
    [personeller, yoklamaSource, selectedYear, selectedMonth]
  );

  const allStaffRows = useMemo((): StaffHakedisRow[] => {
    const rows: StaffHakedisRow[] = [];
    const personelIds = monthPersoneller.map((p) => p.id);
    const hasAdem = monthPersoneller.some((p) => normalizeTurkishName(`${p.ad} ${p.soyad}`) === 'ADEMCAGLAR');
    // #region agent log
    fetch('http://127.0.0.1:7872/ingest/ef5f18bc-f649-42ac-a5a3-37f3283d64f9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9ac11e'},body:JSON.stringify({sessionId:'9ac11e',runId:'baseline-2',hypothesisId:'H5',location:'KibarHakedisScreen.tsx:allStaffRows(start)',message:'month personel list snapshot',data:{selectedYear,selectedMonth,personCount:monthPersoneller.length,hasAdem,firstIds:personelIds.slice(0,10)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    monthPersoneller.forEach(p => {
      const personMap = yoklamaSource[p.id] as Record<string, { durum?: string; mesaiSaati?: number }> | undefined;
      const { geldiGun, mesaiSaat } = sumStrictMonthAttendance(
        p,
        personMap,
        selectedYear,
        selectedMonth
      );
      if (normalizeTurkishName(`${p.ad} ${p.soyad}`) === 'ADEMCAGLAR') {
        const monthKeys = getStrictMonthKeys(personMap, selectedYear, selectedMonth);
        // #region agent log
        fetch('http://127.0.0.1:7872/ingest/ef5f18bc-f649-42ac-a5a3-37f3283d64f9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9ac11e'},body:JSON.stringify({sessionId:'9ac11e',runId:'baseline-2',hypothesisId:'H4',location:'KibarHakedisScreen.tsx:allStaffRows(adem)',message:'target row strict month source',data:{selectedYear,selectedMonth,personId:p.id,tcPresent:Boolean((p.tcNo || '').trim()),girdiGun:geldiGun,mesaiSaat,monthKeyCount:monthKeys.length,monthKeys:monthKeys.slice(0,31)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }
      if (geldiGun > 0) {
        const gunKazanci = calcGunKazanci(p, geldiGun, selectedYear, selectedMonth);
        const mesaiKazanci = calcMesaiKazanci(p, mesaiSaat, selectedYear, selectedMonth);
        rows.push({
          personel: p,
          geldiGun,
          mesaiSaat,
          gunKazanci,
          mesaiKazanci,
          toplamKazanc: gunKazanci + mesaiKazanci,
          zerYapiHakedis: geldiGun * ZER_YAPI_GUNLUK,
        });
      }
    });
    return rows.sort((a, b) =>
      `${a.personel.ad} ${a.personel.soyad}`.localeCompare(`${b.personel.ad} ${b.personel.soyad}`, 'tr')
    );
  }, [monthPersoneller, yoklamaSource, selectedYear, selectedMonth]);

  const handleRefreshYoklama = async () => {
    setRefreshingYoklama(true);
    try {
      const snap = await getDoc(doc(db, 'yoklamalar', 'global_yoklama_map'));
      if (!snap.exists()) {
        showStatus('error', 'Yoklama verisi bulunamadı (global_yoklama_map).');
        return;
      }
      const fresh = parseYoklamaSnapshotData(snap.data() as Record<string, unknown>) as AylikYoklamaMap;
      setYoklamaSource(fresh);
      setLastYoklamaRefreshAt(new Date().toLocaleString('tr-TR'));
      showStatus('success', `${donemLabel} için güncel yoklama verisi çekildi.`);
    } catch (err: any) {
      showStatus('error', `Güncel yoklama çekilemedi: ${err?.message || 'Bilinmeyen hata'}`);
    } finally {
      setRefreshingYoklama(false);
    }
  };

  const activeStaffRows = allStaffRows.filter(r => !excludedStaffIds.includes(r.personel.id));

  const monthlySahaFaaliyetleri = useMemo(
    () => filterByMonth(tumSahaFaaliyetleri, selectedYear, selectedMonth),
    [tumSahaFaaliyetleri, selectedYear, selectedMonth]
  );

  const monthlyKampFaaliyetleri = useMemo(
    () => filterByMonth(kampFaaliyetleri, selectedYear, selectedMonth),
    [kampFaaliyetleri, selectedYear, selectedMonth]
  );

  const sahaFaaliyetSatirlari = useMemo(
    () => prepareSahaFaaliyetRaporu(monthlySahaFaaliyetleri),
    [monthlySahaFaaliyetleri]
  );

  const kampFaaliyetSatirlari = useMemo(
    () => prepareKampFaaliyetRaporu(monthlyKampFaaliyetleri),
    [monthlyKampFaaliyetleri]
  );

  const totalPersonDays = activeStaffRows.reduce((s, r) => s + r.geldiGun, 0);
  const totalMesaiSaat = activeStaffRows.reduce((s, r) => s + r.mesaiSaat, 0);
  const totalGunKazanci = activeStaffRows.reduce((s, r) => s + r.gunKazanci, 0);
  const totalMesaiKazanci = activeStaffRows.reduce((s, r) => s + r.mesaiKazanci, 0);
  const totalMaasKazanci = activeStaffRows.reduce((s, r) => s + r.toplamKazanc, 0);
  const totalZerYapiHakedis = activeStaffRows.reduce((s, r) => s + r.zerYapiHakedis, 0);

  const handleExcludeStaff = (staffId: string) => {
    setExcludedStaffIds(prev => [...prev, staffId]);
  };

  const handleIncludeStaff = (staffId: string) => {
    setExcludedStaffIds(prev => prev.filter(id => id !== staffId));
  };

  const handleSaveReport = async () => {
    setLoading(true);
    try {
      const reportId = `ZER-YAPI-HKD-${donemKey}-${Date.now()}`;
      await saveDocument('kibarHakedisRaporlari', {
        id: reportId,
        donem: donemKey,
        donemLabel,
        yil: selectedYear,
        ay: selectedMonth,
        personelSayisi: activeStaffRows.length,
        toplamCalismaGunu: totalPersonDays,
        birimFiyat: ZER_YAPI_GUNLUK,
        toplamTutar: totalZerYapiHakedis,
        toplamMaasKazanci: totalMaasKazanci,
        olusturan: currentUser?.email || 'sametatak9@gmail.com',
        olusturmaTarihi: new Date().toISOString(),
        faaliyetlerCount: monthlySahaFaaliyetleri.length + monthlyKampFaaliyetleri.length,
        durum: 'KAYDEDİLDİ',
        raporTipi: 'ZER_YAPI_HAKEDIS',
      });
      showStatus('success', `${donemLabel} ZER YAPI Hakediş Raporu kaydedildi!`);
    } catch (err: any) {
      showStatus('error', `Rapor kaydedilirken hata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById('kibar-report-print-area')?.innerHTML;
    if (!printContent) return;

    const printCss = `
      @page { size: A3 portrait; margin: 12mm 10mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0; background: #fff; color: #374151;
        font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; line-height: 1.4;
        overflow-x: hidden; width: 100%;
      }
      section { page-break-inside: auto !important; break-inside: auto !important; margin-bottom: 5mm; }
      table { page-break-inside: auto !important; width: 100% !important; table-layout: fixed !important; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      svg:not(.rpt-logo-mark) { display: none !important; }
      .rpt-logo-mark { display: block !important; max-height: 14mm; width: auto; }
      .rpt-foto-card img { display: block !important; }
      ${REPORT_CSS}
      @media print {
        html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;

    const htmlSnippet = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>ZER_YAPI_Hakedis_${donemKey}</title>
      <style>${printCss}</style>
      </head><body><div class="report-root">${printContent}</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(htmlSnippet);
      win.document.close();
    }
  };

  return (
    <div className="flex-grow p-6 space-y-6 overflow-y-auto h-full font-sans bg-slate-50">

      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 font-black">
            <CreditCard size={22} />
          </div>
          <div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider block w-fit">
              ZER YAPI ÖZEL ERİŞİM
            </span>
            <h1 className="text-lg font-black tracking-tight mt-1 text-white">ZER YAPI HAKEDİŞ DÜZENLEME PANELİ</h1>
            <p className="text-[11px] text-slate-400">Aylık yoklama ve saha faaliyetlerine göre dönemsel hakediş raporu</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl p-2 px-3">
            <Calendar size={14} className="text-emerald-500" />
            <select
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(Number(e.target.value)); setExcludedStaffIds([]); }}
              className="bg-transparent text-xs text-white font-bold outline-none cursor-pointer"
            >
              {TURKISH_MONTHS.map((m, i) => (
                <option key={m} value={i + 1} className="text-slate-900">{m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => { setSelectedYear(Number(e.target.value)); setExcludedStaffIds([]); }}
              className="bg-transparent text-xs text-white font-bold outline-none cursor-pointer"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y} className="text-slate-900">{y}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRefreshYoklama}
            disabled={refreshingYoklama}
            className="bg-slate-900 hover:bg-slate-900 disabled:opacity-60 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow cursor-pointer flex items-center space-x-1"
            title="Seçili ayın güncel yoklamasını veritabanından tekrar çeker."
          >
            <RefreshCw size={12} className={refreshingYoklama ? 'animate-spin' : ''} />
            <span>{refreshingYoklama ? 'Getiriliyor...' : 'Güncel Yoklamayı Getir'}</span>
          </button>
          <button
            onClick={handleSaveReport}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow cursor-pointer flex items-center space-x-1"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            <span>Raporu Kaydet</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl border text-xs font-bold ${
          statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {statusMsg.type === 'success' ? '✓' : '⚠️'} {statusMsg.text}
        </div>
      )}
      {lastYoklamaRefreshAt && (
        <div className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2">
          Son güncel yoklama çekimi: {lastYoklamaRefreshAt}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">DÖNEM: {donemLabel}</span>
              <h3 className="text-xs font-black text-slate-800 mt-0.5">Personel Listesi ({allStaffRows.length})</h3>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                Seçilen ayda en az 1 gün &quot;Geldi&quot; kaydı olan personeller. Hakedişten çıkarmak istediklerinizi işaretleyin.
              </p>
            </div>

            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {allStaffRows.length === 0 ? (
                <div className="text-center py-8 text-slate-400 italic text-[11px]">
                  {donemLabel} döneminde yoklama kaydı bulunamadı. Yoklama ekranından Excel aktarımını yapın.
                </div>
              ) : (
                allStaffRows.map(({ personel: p, geldiGun, mesaiSaat, gunKazanci, mesaiKazanci, toplamKazanc, zerYapiHakedis }) => {
                  const isExcluded = excludedStaffIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`flex justify-between items-center p-2.5 rounded-xl border transition ${
                        isExcluded ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60' : 'bg-slate-50/40 border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className={`text-xs font-bold block ${isExcluded ? 'line-through' : 'text-slate-800'}`}>
                          {p.ad} {p.soyad}
                        </span>
                        <span className="text-[9px] text-slate-500 block uppercase font-semibold">
                          {normalizeGorev(p.gorev)} • {geldiGun} gün
                          {mesaiSaat > 0 && ` • ${mesaiSaat} sa mesai`}
                        </span>
                        <span className="text-[8px] text-slate-800 block">
                          Gün kaz.: {formatMoney(gunKazanci)}
                          {mesaiKazanci > 0 && ` + Mesai: ${formatMoney(mesaiKazanci)}`}
                          {' = '}{formatMoney(toplamKazanc)}
                        </span>
                        <span className="text-[8px] text-emerald-700 font-bold block">
                          ZER YAPI: {formatMoney(zerYapiHakedis, 0)} ({geldiGun}×{ZER_YAPI_GUNLUK})
                        </span>
                      </div>
                      {isExcluded ? (
                        <button onClick={() => handleIncludeStaff(p.id)} className="bg-slate-50 border border-slate-200 text-slate-800 font-bold text-[9px] py-1 px-2.5 rounded-lg cursor-pointer">
                          Dahil Et
                        </button>
                      ) : (
                        <button onClick={() => handleExcludeStaff(p.id)} className="bg-rose-50 border border-rose-100 text-rose-600 font-bold text-[9px] py-1 px-2.5 rounded-lg cursor-pointer flex items-center space-x-1">
                          <UserX size={10} /><span>Çıkar</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Dönem Özeti</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-50 border p-3 rounded-xl">
                <span className="text-[8px] text-slate-500 font-bold block uppercase">Personel</span>
                <span className="text-base font-extrabold text-slate-800 block mt-0.5">{activeStaffRows.length} Kişi</span>
              </div>
              <div className="bg-slate-50 border p-3 rounded-xl">
                <span className="text-[8px] text-slate-500 font-bold block uppercase">Toplam İş Günü</span>
                <span className="text-base font-extrabold text-slate-700 block mt-0.5">{totalPersonDays} Gün</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
              <span className="text-[9px] text-slate-800 font-bold block uppercase">Maaş Kaynaklı Kazançlar (Bilgi)</span>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-800">Gün kazancı</span>
                <span className="font-mono font-bold text-slate-800">{formatMoney(totalGunKazanci)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-amber-700">Mesai kazancı</span>
                <span className="font-mono font-bold text-amber-800">{formatMoney(totalMesaiKazanci)}</span>
              </div>
              <div className="flex justify-between text-[10px] border-t border-slate-200 pt-2">
                <span className="text-indigo-800 font-bold">Toplam kazanç</span>
                <span className="font-mono font-black text-indigo-900">{formatMoney(totalMaasKazanci)}</span>
              </div>
            </div>

            <div className="bg-emerald-500/10 border-2 border-emerald-500/30 p-4 rounded-xl text-center">
              <span className="text-[9px] text-emerald-800 font-black block uppercase tracking-wide">
                ZER YAPI Hakediş — {donemLabel}
              </span>
              <span className="text-lg font-black text-emerald-700 font-mono mt-1 block">
                {formatMoney(totalZerYapiHakedis, 0)}
              </span>
              <span className="text-[8px] text-emerald-600 block mt-1 font-semibold">
                Formül: {totalPersonDays} gün × ₺{ZER_YAPI_GUNLUK} (maaş kazancından ayrı)
              </span>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-700">Rapor Türü:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button onClick={() => setReportType('NORMAL')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${reportType === 'NORMAL' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>
                  Normal Rapor
                </button>
                <button onClick={() => setReportType('E-IMZALI')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition flex items-center space-x-1 ${reportType === 'E-IMZALI' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500'}`}>
                  <ShieldCheck size={11} /><span>E-İmzalı</span>
                </button>
              </div>
            </div>
            <button onClick={handlePrint} className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1.5 shadow cursor-pointer">
              <Printer size={13} /><span>Yazdır / PDF (A3)</span>
            </button>
          </div>

          <div className="bg-white border rounded-3xl p-6 shadow-sm">
            <div id="kibar-report-print-area" className="report-root bg-white text-xs text-slate-800">
              <style>{REPORT_CSS}</style>
              <CorporateReportLayout orientation="landscape" docCode={`ZER-YAPI-${donemKey}`}>
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">ZER YAPI · Aylık Hakediş & Faaliyet Mutabakatı · {donemLabel}</p>
              <div className="rpt-header-title mb-4">
                Şantiye Sahası Aylık Hakediş ve Faaliyet Raporu — {donemLabel}
              </div>

              {/* —— ZER YAPI Hakediş Özeti (rapor başı) —— */}
              <div className="rpt-zer-box">
                <h4>ZER YAPI Hakediş Formülü — Dönem Kazancı</h4>
                <p className="rpt-zer-formula">
                  Formül: Toplam çalışma günü × ₺{ZER_YAPI_GUNLUK} günlük birim bedel
                  &nbsp;|&nbsp; {totalPersonDays} gün × ₺{ZER_YAPI_GUNLUK} = {formatMoney(totalZerYapiHakedis, 0)}
                </p>
                <div className="rpt-zer-total">{formatMoney(totalZerYapiHakedis, 0)}</div>
                <p className="rpt-zer-meta">
                  {activeStaffRows.length} personel · {totalPersonDays} iş-günü · {donemLabel}
                  &nbsp;—&nbsp; Bu tutar maaş kazancından bağımsızdır.
                </p>
              </div>

              {/* —— 1. PERSONEL —— */}
              <section>
                <p className="rpt-sec-title m-0">1 · Personel Kazanç ve Hakediş Detayı</p>
                <p className="rpt-sec-sub">{activeStaffRows.length} personel · {totalPersonDays} gün · {totalMesaiSaat} sa mesai</p>
                <div className="rpt-table-wrap">
                  <table className="rpt-staff-table">
                    <colgroup>
                      <col style={{ width: '4%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '11%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="rpt-align-c" rowSpan={2}>#</th>
                        <th className="rpt-align-l" rowSpan={2}>Ad Soyad</th>
                        <th className="rpt-align-l" rowSpan={2}>Görev</th>
                        <th className="rpt-align-r" rowSpan={2}>Maaş</th>
                        <th className="rpt-align-c" rowSpan={2}>Gün</th>
                        <th className="rpt-align-c" rowSpan={2}>Mesai</th>
                        <th className="rpt-align-c rpt-grp-sep" colSpan={3}>Maaş Kazancı</th>
                        <th className="rpt-align-c rpt-grp-sep rpt-th-hakedis" colSpan={2}>ZER YAPI Hakediş</th>
                      </tr>
                      <tr>
                        <th className="rpt-align-r rpt-grp-sep">Gün</th>
                        <th className="rpt-align-r">Mesai</th>
                        <th className="rpt-align-r">Toplam</th>
                        <th className="rpt-align-c rpt-grp-sep">₺/Gün</th>
                        <th className="rpt-align-r rpt-th-hakedis">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStaffRows.map((row, idx) => (
                        <tr key={row.personel.id}>
                          <td className="rpt-align-c rpt-mono rpt-mono-nowrap">{idx + 1}</td>
                          <td className="rpt-name">{row.personel.ad} {row.personel.soyad}</td>
                          <td className="rpt-align-l uppercase">{normalizeGorev(row.personel.gorev)}</td>
                          <td className="rpt-td-num rpt-mono rpt-mono-nowrap">{formatMoney(row.personel.maas || 30000, 0)}</td>
                          <td className="rpt-align-c rpt-mono rpt-mono-nowrap">{row.geldiGun}</td>
                          <td className="rpt-align-c rpt-mono rpt-mono-nowrap">{row.mesaiSaat > 0 ? row.mesaiSaat : '—'}</td>
                          <td className="rpt-td-num rpt-mono rpt-mono-nowrap rpt-grp-sep">{formatMoney(row.gunKazanci)}</td>
                          <td className="rpt-td-num rpt-mono rpt-mono-nowrap">{row.mesaiKazanci > 0 ? formatMoney(row.mesaiKazanci) : '—'}</td>
                          <td className="rpt-td-num rpt-mono rpt-mono-nowrap">{formatMoney(row.toplamKazanc)}</td>
                          <td className="rpt-align-c rpt-mono rpt-mono-nowrap rpt-grp-sep">{ZER_YAPI_GUNLUK}</td>
                          <td className="rpt-td-hakedis rpt-mono rpt-mono-nowrap">{formatMoney(row.zerYapiHakedis, 0)}</td>
                        </tr>
                      ))}
                      {activeStaffRows.length === 0 && (
                        <tr><td colSpan={11} className="rpt-align-c py-6 text-slate-400 italic">Kayıt yok</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="rpt-foot">
                        <td colSpan={4} className="rpt-align-r uppercase">Toplam</td>
                        <td className="rpt-align-c rpt-mono rpt-mono-nowrap">{totalPersonDays}</td>
                        <td className="rpt-align-c rpt-mono rpt-mono-nowrap">{totalMesaiSaat}</td>
                        <td className="rpt-td-num rpt-mono rpt-mono-nowrap rpt-grp-sep">{formatMoney(totalGunKazanci)}</td>
                        <td className="rpt-td-num rpt-mono rpt-mono-nowrap">{formatMoney(totalMesaiKazanci)}</td>
                        <td className="rpt-td-num rpt-mono rpt-mono-nowrap">{formatMoney(totalMaasKazanci)}</td>
                        <td className="rpt-align-c rpt-mono rpt-mono-nowrap rpt-grp-sep">×{ZER_YAPI_GUNLUK}</td>
                        <td className="rpt-td-hakedis rpt-mono rpt-mono-nowrap">{formatMoney(totalZerYapiHakedis, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* —— 2. SAHA FAALİYETLERİ —— */}
              <section>
                <p className="rpt-sec-title m-0">2 · Saha Faaliyet Raporları</p>
                <p className="rpt-sec-sub">{sahaFaaliyetSatirlari.length} kayıt · eskiden yeniye tarih sırası</p>
                {sahaFaaliyetSatirlari.length === 0 ? (
                  <p className="text-[9px] text-slate-400 italic">Bu dönemde saha faaliyeti kaydı yok.</p>
                ) : (
                  <div className="rpt-table-wrap">
                    <table className="rpt-act-table">
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '60%' }} />
                        <col style={{ width: '10%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="rpt-align-c rpt-act-no">No</th>
                          <th className="rpt-align-l rpt-act-date">Tarih</th>
                          <th className="rpt-align-l rpt-act-parsel">Parsel</th>
                          <th className="rpt-align-l rpt-act-blok">Blok</th>
                          <th className="rpt-align-l rpt-act-desc">Yapılan İş / Faaliyet</th>
                          <th className="rpt-align-r rpt-act-pers">Pers.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sahaFaaliyetSatirlari.map(sf => (
                          <tr key={sf.id}>
                            <td className="rpt-align-c rpt-mono rpt-act-no">{sf.siraNo}</td>
                            <td className="rpt-act-date rpt-align-l">
                              <span className="rpt-act-date-main">{sf.tarihDate}</span>
                              {sf.tarihDay && <span className="rpt-act-date-day">{sf.tarihDay}</span>}
                            </td>
                            <td className="rpt-act-parsel rpt-align-l" title={sf.parselKisa}>{sf.parselKisa}</td>
                            <td className="rpt-act-blok rpt-align-l" title={sf.blokKisa}>{sf.blokKisa}</td>
                            <td className="rpt-act-desc rpt-align-l">{faaliyetIsTanimi(sf)}</td>
                            <td className="rpt-act-pers rpt-align-r">{formatPersonelSayisi(sf)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* —— 3. KAMP FAALİYETLERİ —— */}
              <section>
                <p className="rpt-sec-title m-0">3 · Kamp / Lojman Faaliyetleri</p>
                <p className="rpt-sec-sub">{kampFaaliyetSatirlari.length} kayıt</p>
                {kampFaaliyetSatirlari.length === 0 ? (
                  <p className="text-[9px] text-slate-400 italic">Bu dönemde kamp faaliyeti kaydı yok.</p>
                ) : (
                  <div className="rpt-table-wrap">
                    <table className="rpt-act-table">
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '67%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="rpt-align-c rpt-act-no">No</th>
                          <th className="rpt-align-l rpt-kamp-date">Tarih</th>
                          <th className="rpt-align-l rpt-kamp-tip">Tip</th>
                          <th className="rpt-align-l rpt-kamp-desc">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kampFaaliyetSatirlari.map(kf => (
                          <tr key={kf.id}>
                            <td className="rpt-align-c rpt-mono rpt-mono-nowrap rpt-act-no">{kf.siraNo}</td>
                            <td className="rpt-kamp-date rpt-align-l">
                              <span className="rpt-act-date-main">{kf.tarihDate}</span>
                              {kf.tarihDay && <span className="rpt-act-date-day">{kf.tarihDay}</span>}
                            </td>
                            <td className="rpt-kamp-tip rpt-align-l">{kf.faaliyetTipi}</td>
                            <td className="rpt-kamp-desc rpt-align-l">{kf.aciklama}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* —— 4. SAHA KOLAJ FOTO ALBÜMÜ —— */}
              <section>
                <p className="rpt-sec-title m-0">4 · Saha Foto Albümü (Kolaj)</p>
                <p className="rpt-sec-sub">
                  Toplam {birlesikKolajFotolari.length} fotoğraf
                  {` · albüm: ${kolajFotolari.length} · faaliyet: ${Math.max(0, birlesikKolajFotolari.length - kolajFotolari.length)}`}
                  {kolajFotoLimit.length < birlesikKolajFotolari.length
                    ? ` · raporda ilk ${kolajFotoLimit.length} adet`
                    : ''}
                </p>
                {kolajFotoLimit.length === 0 ? (
                  <p className="text-[9px] text-slate-400 italic">
                    Bu dönem için saha kolaj / faaliyet fotoğrafı yok.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupKolajFotolari(kolajFotoLimit).map((grup) => (
                      <div key={grup.ad}>
                        <p className="rpt-foto-grup">{grup.ad}</p>
                        <div className="rpt-foto-grid">
                          {grup.fotolar.map((f) => (
                            <div key={f.id} className="rpt-foto-card">
                              <img src={f.imageUrl} alt={f.baslik || f.dosyaAdi || 'Saha foto'} />
                              <div className="rpt-foto-cap">
                                {(f.baslik || f.aciklama || f.dosyaAdi || 'Saha').slice(0, 48)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* —— Özet —— */}
              <div className="rpt-summary-grid">
                <div className="rpt-summary-card">
                  <span>Toplam Maaş Kazancı</span>
                  <span className="rpt-summary-val">{formatMoney(totalMaasKazanci)}</span>
                  <span className="rpt-summary-sub">Gün + mesai (bilgi amaçlı)</span>
                </div>
                <div className="rpt-summary-card rpt-summary-hakedis">
                  <span>ZER YAPI Hakediş Toplamı</span>
                  <span className="rpt-summary-val">{formatMoney(totalZerYapiHakedis, 0)}</span>
                  <span className="rpt-summary-sub">{totalPersonDays} gün × ₺{ZER_YAPI_GUNLUK}</span>
                </div>
              </div>

              {/* —— İmza —— */}
              <div className="pt-2 border-t border-slate-200">
                {reportType === 'E-IMZALI' ? (
                  <div className="rpt-eimza">
                    <span className="font-bold uppercase block mb-1">E-İmza ile Onaylanmıştır</span>
                    <span className="text-slate-500">Doğrulayan: {currentUser?.email || 'sametatak9@gmail.com'}</span>
                  </div>
                ) : (
                  <div className="rpt-sign-grid">
                    <div className="rpt-sign-box">
                      <span className="rpt-sign-label">Hazırlayan</span>
                      <div className="rpt-sign-space" />
                      <span className="rpt-sign-hint">İmza</span>
                    </div>
                    <div className="rpt-sign-box">
                      <span className="rpt-sign-label">Proje Müdürü</span>
                      <div className="rpt-sign-space" />
                      <span className="rpt-sign-hint">İmza / Kaşe</span>
                    </div>
                  </div>
                )}
              </div>

              </CorporateReportLayout>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
