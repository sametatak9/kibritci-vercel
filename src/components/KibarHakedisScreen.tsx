import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, Calendar, Printer, ShieldCheck, CheckCircle2,
  RefreshCw, UserX, BarChart3, Copy, Download, Users, FileText, X, Layers
} from 'lucide-react';
import { db, parseYoklamaSnapshotData, saveDocument } from '../lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { Personel, AylikYoklamaMap, SahaKolajFoto, ProgramliFaaliyet, TesisatciFaaliyet, MermerciFaaliyet, SeramikFaaliyet } from '../types/erp';
import { tesisatciToSaha, mermerciToSaha, seramikToSaha } from '../lib/mobilFaaliyetAdapter';
import { CorporateReportLayout } from './CorporateReportLayout';
import { CORPORATE_COMPANY, getCorporateReportCss } from '../lib/corporateReportHtml';
import { isDayActiveForPersonel } from '../lib/yoklamaUtils';
import { normalizeGorev, isUstaGorev } from '../lib/gorevUtils';
import { personelHasTakipEtiketi } from '../lib/personelTakipEtiketUtils';
import {
  prepareSahaFaaliyetRaporu,
  prepareKampFaaliyetRaporu,
  faaliyetIsTanimi,
  formatPersonelSayisi,
} from '../lib/kibarReportUtils';
import { groupKolajFotolari, mergeAlbumFotolari } from '../lib/sahaKolajUtils';
import {
  buildKibritciReportHtml,
  downloadKibritciReportHtml,
  openKibritciReportPrint,
} from '../lib/kibritciReportTemplate';

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

/** ZER YAPI günlük hakediş: 3.000 TL / 30 gün = 100 TL/gün */
const ZER_YAPI_GUNLUK = 100;
/** Her personelin mevcut tabanına eklenen fark — «6.000 TL pahalıya çalışsaydı» */
const TABAN_FARK_TL = 6_000;
const DEFAULT_MAAS_TABANI = 30_000;

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
  .rpt-zarar-box {
    border: 2px solid #047857; background: #ecfdf5; border-radius: 4px;
    padding: 14px 16px; margin: 10px 0; page-break-inside: avoid;
  }
  .rpt-zarar-box h4 {
    margin: 0 0 6px; font-size: 9pt; color: #065f46;
    text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800;
  }
  .rpt-zarar-hero {
    font-size: 18pt; font-weight: 900; color: #047857;
    font-family: Consolas, 'Courier New', monospace; margin: 6px 0 4px;
  }
  .rpt-zarar-msg {
    font-size: 8.5pt; color: #065f46; line-height: 1.5; margin: 0 0 6px; font-weight: 600;
  }
  .rpt-math-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0;
  }
  .rpt-math-col {
    border: 1px solid #d1d5db; border-radius: 4px; padding: 10px; background: #fff;
  }
  .rpt-math-col--now { border-color: #64748b; background: #f8fafc; }
  .rpt-math-col--plus { border-color: #b91c1c; background: #fff7f7; }
  .rpt-math-col--delta { border-color: #047857; background: #ecfdf5; }
  .rpt-math-col h5 {
    margin: 0 0 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em;
    font-weight: 800; color: #374151;
  }
  .rpt-math-col--plus h5 { color: #991b1b; }
  .rpt-math-col--delta h5 { color: #065f46; }
  .rpt-math-row {
    display: flex; justify-content: space-between; gap: 8px;
    font-size: 7.5pt; color: #4b5563; padding: 3px 0; border-bottom: 1px solid #f3f4f6;
  }
  .rpt-math-row:last-child { border-bottom: 0; font-weight: 800; color: #111827; padding-top: 6px; }
  .rpt-math-row span:last-child { font-family: Consolas, 'Courier New', monospace; white-space: nowrap; }
  .rpt-math-formula {
    font-size: 7pt; color: #6b7280; margin: 0 0 8px; line-height: 1.4;
    font-family: Consolas, 'Courier New', monospace;
  }
  .rpt-antet-line {
    font-size: 7pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;
    margin: 0 0 8px; font-weight: 700;
  }
  .rpt-compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .rpt-compare-card { border: 1px solid #d1d5db; border-radius: 4px; padding: 10px; background: #fafafa; }
  .rpt-compare-card strong { color: #1f2937; }
  .rpt-quote { border-left: 3px solid #059669; padding-left: 10px; font-size: 8.5pt; color: #374151; line-height: 1.45; background: #f9fafb; padding: 8px 10px; border-radius: 4px; }
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

function resolveMaasTabani(personel: Personel): number {
  const m = Number(personel.maas);
  return Number.isFinite(m) && m > 0 ? m : DEFAULT_MAAS_TABANI;
}

function calcGunKazanciFromWage(baseWage: number, geldiGun: number, year: number, month: number): number {
  if (geldiGun <= 0 || baseWage <= 0) return 0;
  return geldiGun * (baseWage / daysInMonth(year, month));
}

function calcMesaiKazanciFromWage(baseWage: number, mesaiSaat: number, year: number, month: number): number {
  if (mesaiSaat <= 0 || baseWage <= 0) return 0;
  const hourlyWage = baseWage / daysInMonth(year, month) / 7.5;
  return mesaiSaat * hourlyWage * 1.5;
}

function calcGunKazanci(personel: Personel, geldiGun: number, year: number, month: number): number {
  return calcGunKazanciFromWage(resolveMaasTabani(personel), geldiGun, year, month);
}

function calcMesaiKazanci(personel: Personel, mesaiSaat: number, year: number, month: number): number {
  return calcMesaiKazanciFromWage(resolveMaasTabani(personel), mesaiSaat, year, month);
}

function formatMoney(amount: number, fraction = 2): string {
  return `₺${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  })}`;
}

function buildRoleMix(rows: StaffHakedisRow[]) {
  const mix = {
    duzIsci: 0,
    usta: 0,
    formen: 0,
    senior: 0,
    diger: 0,
  };

  rows.forEach((row) => {
    const role = normalizeGorev(row.personel.gorev).toLowerCase();
    if (role.includes('usta')) mix.usta += 1;
    else if (role.includes('form')) mix.formen += 1;
    else if (role.includes('şen') || role.includes('sen')) mix.senior += 1;
    else if (role.includes('işçi') || role.includes('duz')) mix.duzIsci += 1;
    else mix.diger += 1;
  });

  return mix;
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
  const [seramikFaaliyetleri, setSeramikFaaliyetleri] = useState<SeramikFaaliyet[]>([]);
  const [kolajFotolari, setKolajFotolari] = useState<SahaKolajFoto[]>([]);
  const [excludedStaffIds, setExcludedStaffIds] = useState<string[]>([]);
  const [reportType, setReportType] = useState<'NORMAL' | 'E-IMZALI'>('NORMAL');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [yoklamaSource, setYoklamaSource] = useState<AylikYoklamaMap>(yoklamalar);
  const [refreshingYoklama, setRefreshingYoklama] = useState(false);
  const [lastYoklamaRefreshAt, setLastYoklamaRefreshAt] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [showUstaListeModal, setShowUstaListeModal] = useState(false);
  const [showTopluAyModal, setShowTopluAyModal] = useState(false);
  const [topluAyYil, setTopluAyYil] = useState(now.getFullYear());
  /** Varsayılan: Şubat–Temmuz (sık kullanılan tahsilat aralığı) */
  const [topluAySecimler, setTopluAySecimler] = useState<number[]>([2, 3, 4, 5, 6, 7]);
  const [topluAyBusy, setTopluAyBusy] = useState(false);

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
    const unsubSeramik = onSnapshot(collection(db, 'seramikFaaliyetleri'), (snap) => {
      const list: SeramikFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SeramikFaaliyet, 'id'>) }));
      setSeramikFaaliyetleri(list);
    });
    return () => {
      unsubKamp();
      unsubTesisatci();
      unsubMermerci();
      unsubSeramik();
    };
  }, []);

  // Saha + tesisatçı + mermerci birleşik liste (ZER YAPI Hakediş tüm faaliyetleri kapsar)
  const tumSahaFaaliyetleri = useMemo(
    () => [
      ...(sahaFaaliyetleri || []),
      ...tesisatciFaaliyetleri.map(tesisatciToSaha),
      ...mermerciFaaliyetleri.map(mermerciToSaha),
      ...seramikFaaliyetleri.map(seramikToSaha),
    ],
    [sahaFaaliyetleri, tesisatciFaaliyetleri, mermerciFaaliyetleri, seramikFaaliyetleri]
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
        kampFaaliyetleri,
      }),
    [donemKey, selectedYear, selectedMonth, kolajFotolari, tumSahaFaaliyetleri, programliFaaliyetler, kampFaaliyetleri]
  );

  // Yazdırma performansını korumak için üst sınır; tüm sayım subtitle'da gösterilir
  const HAKEDIS_FOTO_LIMIT = 120;
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

  const buildRowsForMonth = (year: number, month: number): StaffHakedisRow[] => {
    const tagged = (personeller || []).filter((p) => personelHasTakipEtiketi(p, 'ZER YAPI'));
    const rows: StaffHakedisRow[] = tagged.map((p) => {
      const personMap = yoklamaSource[p.id] as Record<string, { durum?: string; mesaiSaati?: number }> | undefined;
      const { geldiGun, mesaiSaat } = sumStrictMonthAttendance(p, personMap, year, month);
      const gunKazanci = calcGunKazanci(p, geldiGun, year, month);
      const mesaiKazanci = calcMesaiKazanci(p, mesaiSaat, year, month);
      return {
        personel: p,
        geldiGun,
        mesaiSaat,
        gunKazanci,
        mesaiKazanci,
        toplamKazanc: gunKazanci + mesaiKazanci,
        zerYapiHakedis: geldiGun * ZER_YAPI_GUNLUK,
      };
    });

    return rows.sort((a, b) =>
      `${a.personel.ad} ${a.personel.soyad}`.localeCompare(`${b.personel.ad} ${b.personel.soyad}`, 'tr')
    );
  };

  const allStaffRows = useMemo((): StaffHakedisRow[] => {
    return buildRowsForMonth(selectedYear, selectedMonth);
  }, [personeller, yoklamaSource, selectedYear, selectedMonth]);

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

  const ustaliRows = useMemo(
    () => activeStaffRows.filter((r) => isUstaGorev(r.personel.gorev)),
    [activeStaffRows]
  );
  const ustasizRows = useMemo(
    () => activeStaffRows.filter((r) => !isUstaGorev(r.personel.gorev)),
    [activeStaffRows]
  );

  const summarizeRows = (rows: StaffHakedisRow[]) => {
    const geldi = rows.reduce((s, r) => s + r.geldiGun, 0);
    const mesai = rows.reduce((s, r) => s + r.mesaiSaat, 0);
    const gunKaz = rows.reduce((s, r) => s + r.gunKazanci, 0);
    const mesaiKaz = rows.reduce((s, r) => s + r.mesaiKazanci, 0);
    const maas = rows.reduce((s, r) => s + r.toplamKazanc, 0);
    const zer = rows.reduce((s, r) => s + r.zerYapiHakedis, 0);
    return { geldi, mesai, gunKaz, mesaiKaz, maas, zer, kisi: rows.length };
  };

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

  /** Kamp faaliyet fotoğrafları — tabloda yan yana değil, kolaj bölümünde */
  const kampKolajFotolari = useMemo(() => {
    const fromMerge = birlesikKolajFotolari.filter(
      (f) => f.parsel === 'Kamp' || String(f.id || '').startsWith('kamp_')
    );
    if (fromMerge.length > 0) return fromMerge;
    return kampFaaliyetSatirlari
      .filter((k) => k.fotoUrl)
      .map((k, i) => ({
        id: `kamp_rpt_${k.id}`,
        albumKey: donemKey,
        yil: selectedYear,
        ay: selectedMonth,
        imageUrl: k.fotoUrl!,
        baslik: k.faaliyetTipi || 'Kamp',
        aciklama: k.aciklama,
        grupAdi: 'Kamp Faaliyetleri',
        sira: i + 1,
        yuklemeTarihi: k.tarihDate || donemKey,
        yukleyen: 'Kampçı',
        parsel: 'Kamp',
        blok: k.faaliyetTipi || 'Lojman',
      })) as SahaKolajFoto[];
  }, [birlesikKolajFotolari, kampFaaliyetSatirlari, donemKey, selectedYear, selectedMonth]);

  const totalPersonDays = activeStaffRows.reduce((s, r) => s + r.geldiGun, 0);
  const totalMesaiSaat = activeStaffRows.reduce((s, r) => s + r.mesaiSaat, 0);
  const totalGunKazanci = activeStaffRows.reduce((s, r) => s + r.gunKazanci, 0);
  const totalMesaiKazanci = activeStaffRows.reduce((s, r) => s + r.mesaiKazanci, 0);
  const totalMaasKazanci = activeStaffRows.reduce((s, r) => s + r.toplamKazanc, 0);
  const totalZerYapiHakedis = activeStaffRows.reduce((s, r) => s + r.zerYapiHakedis, 0);

  const analysisSummary = useMemo(() => {
    const roleMix = buildRoleMix(activeStaffRows);
    const days = daysInMonth(selectedYear, selectedMonth);

    let senaryoGunToplam = 0;
    let senaryoMesaiToplam = 0;
    let mevcutTabanToplam = 0;
    let senaryoTabanToplam = 0;

    const personelSenaryolari = activeStaffRows.map((row) => {
      const mevcutTaban = resolveMaasTabani(row.personel);
      const senaryoTaban = mevcutTaban + TABAN_FARK_TL;
      mevcutTabanToplam += mevcutTaban;
      senaryoTabanToplam += senaryoTaban;

      // Aynı geldi gün + aynı mesai saati; taban +6000 → gün VE mesai hakedişi birlikte artar
      const senaryoGun = calcGunKazanciFromWage(senaryoTaban, row.geldiGun, selectedYear, selectedMonth);
      const senaryoMesai = calcMesaiKazanciFromWage(senaryoTaban, row.mesaiSaat, selectedYear, selectedMonth);
      const senaryoToplam = senaryoGun + senaryoMesai;
      senaryoGunToplam += senaryoGun;
      senaryoMesaiToplam += senaryoMesai;

      return {
        adSoyad: `${row.personel.ad} ${row.personel.soyad}`.trim(),
        gorev: normalizeGorev(row.personel.gorev),
        mevcutTaban,
        senaryoTaban,
        tabanFark: TABAN_FARK_TL,
        geldiGun: row.geldiGun,
        mesaiSaat: row.mesaiSaat,
        mevcutGun: row.gunKazanci,
        mevcutMesai: row.mesaiKazanci,
        mevcutToplam: row.toplamKazanc,
        senaryoGun,
        senaryoMesai,
        senaryoToplam,
        gunFarki: senaryoGun - row.gunKazanci,
        mesaiFarki: senaryoMesai - row.mesaiKazanci,
        // Bu satırın şirkete sağladığı tasarruf (= pahalı senaryo − şuanki)
        sirketKari: senaryoToplam - row.toplamKazanc,
        masrafFarki: senaryoToplam - row.toplamKazanc,
        donemUygunluk: senaryoToplam - row.toplamKazanc,
      };
    });

    const senaryoToplamMasraf = senaryoGunToplam + senaryoMesaiToplam;
    const gunTasarrufu = senaryoGunToplam - totalGunKazanci;
    const mesaiTasarrufu = senaryoMesaiToplam - totalMesaiKazanci;
    // +6.000 TL taban olsaydı ödenecek FAZLA maaş (gün + mesai birlikte artar)
    const fazlaMaasOdemesi = senaryoToplamMasraf - totalMaasKazanci;
    const aylikSirketKari = fazlaMaasOdemesi;
    // ZER ödeneği şirket öder → kardan düşülür. Net kar = kaçınılan fazla maaş − ZER ödeneği
    const zerGeliri = totalZerYapiHakedis;
    const donemToplamFayda = fazlaMaasOdemesi - zerGeliri;
    const ortalamaMevcutTaban = activeStaffRows.length > 0 ? mevcutTabanToplam / activeStaffRows.length : 0;
    const ortalamaSenaryoTaban = activeStaffRows.length > 0 ? senaryoTabanToplam / activeStaffRows.length : 0;
    const ortalamaKisiKari = activeStaffRows.length > 0 ? aylikSirketKari / activeStaffRows.length : 0;
    const mesaiPayiPct = aylikSirketKari > 0 ? (mesaiTasarrufu / aylikSirketKari) * 100 : 0;

    const enCokEtkilenen = [...personelSenaryolari]
      .sort((a, b) => b.sirketKari - a.sirketKari)
      .slice(0, 5)
      .filter((p) => p.sirketKari >= 1);

    const güçlüArgüman = [
      `+${formatMoney(TABAN_FARK_TL, 0)} taban olsaydı fazla maaş ödemesi ${formatMoney(fazlaMaasOdemesi, 0)} olurdu (gün ${formatMoney(gunTasarrufu, 0)} + mesai ${formatMoney(mesaiTasarrufu, 0)}).`,
      `Mesai tabana bağlıdır: (taban ÷ ${days} ÷ 7,5) × 1,5 × saat — taban artınca mesai ücreti de artar.`,
      `ZER YAPI ödeneği (şirket öder): ${totalPersonDays} gün × ₺${ZER_YAPI_GUNLUK} = ${formatMoney(zerGeliri, 0)}.`,
      `Dönem net şirket karı (+6.000 fark − ZER ödeneği) = ${formatMoney(donemToplamFayda, 0)}.`,
    ].join(' ');

    const shareableParagraphs = [
      `KİBRİTÇİ · ZER YAPI KARŞILAŞTIRMA — ${donemLabel}`,
      `Şuanki maaş masrafı: ${formatMoney(totalMaasKazanci, 0)}`,
      `+${formatMoney(TABAN_FARK_TL, 0)} taban olsaydı: ${formatMoney(senaryoToplamMasraf, 0)}`,
      `FAZLA MAAŞ ÖDEMESİ (gün+mesai): ${formatMoney(fazlaMaasOdemesi, 0)}  →  Gün ${formatMoney(gunTasarrufu, 0)} · Mesai ${formatMoney(mesaiTasarrufu, 0)}`,
      `ZER YAPI ödeneği: ${totalPersonDays} gün × ₺${ZER_YAPI_GUNLUK} = ${formatMoney(zerGeliri, 0)}`,
      `Dönem net şirket karı (+6.000 fark − ZER ödeneği): ${formatMoney(donemToplamFayda, 0)}`,
      `Kapsam: ${activeStaffRows.length} personel · ${totalPersonDays} iş-günü · ${totalMesaiSaat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa mesai`,
      güçlüArgüman,
    ].join('\n');

    return {
      roleMix,
      ortalamaKisiBasiKar: ortalamaKisiKari,
      gunBasiKar: totalPersonDays > 0 ? fazlaMaasOdemesi / totalPersonDays : 0,
      güçlüArgüman,
      shareableParagraphs,
      days,
      tabanFarkTl: TABAN_FARK_TL,
      senaryoMaasTabani: TABAN_FARK_TL,
      senaryoGunToplam,
      senaryoMesaiToplam,
      senaryoToplamMasraf,
      gunTasarrufu,
      mesaiTasarrufu,
      fazlaMaasOdemesi,
      zerGeliri,
      donemToplamFayda,
      aylikSirketKari,
      mesaiPayiPct,
      // geriye uyum
      masrafArtisi: aylikSirketKari,
      donemZarari: aylikSirketKari,
      donemSirketKari: aylikSirketKari,
      gunMasrafArtisi: gunTasarrufu,
      mesaiMasrafArtisi: mesaiTasarrufu,
      ortalamaMevcutTaban,
      ortalamaSenaryoTaban,
      ortalamaTabanFark: TABAN_FARK_TL,
      ortalamaKisiMasrafArtisi: ortalamaKisiKari,
      ortalamaGunlukKar: 0,
      ortalamaGunlukMevcudiyet: 0,
      ornekGunlukKar: 0,
      ornekGunlukKisi: 0,
      gunlukUygunluk: ZER_YAPI_GUNLUK,
      ornekTabanFark: TABAN_FARK_TL,
      enCokEtkilenen,
      personelSenaryolari,
    };
  }, [
    activeStaffRows,
    donemLabel,
    selectedMonth,
    selectedYear,
    totalGunKazanci,
    totalMaasKazanci,
    totalMesaiKazanci,
    totalMesaiSaat,
    totalPersonDays,
    totalZerYapiHakedis,
  ]);

  const shareableSummary = analysisSummary.shareableParagraphs;

  const escHtml = (s: unknown) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const computeKarSlice = (
    rows: StaffHakedisRow[],
    year: number = selectedYear,
    month: number = selectedMonth
  ) => {
    let mevcut = 0;
    let senaryo = 0;
    let geldi = 0;
    for (const row of rows) {
      const taban = resolveMaasTabani(row.personel);
      const senTaban = taban + TABAN_FARK_TL;
      mevcut += row.toplamKazanc;
      geldi += row.geldiGun;
      senaryo +=
        calcGunKazanciFromWage(senTaban, row.geldiGun, year, month) +
        calcMesaiKazanciFromWage(senTaban, row.mesaiSaat, year, month);
    }
    const zarar = senaryo - mevcut;
    const zer = rows.reduce((s, r) => s + r.zerYapiHakedis, 0);
    return { mevcut, senaryo, zarar, zer, geldi, kisi: rows.length };
  };

  const buildPersonelHakedisBodyHtml = (opts: {
    rows: StaffHakedisRow[];
    varyant: 'ustasiz' | 'ustali';
    /** true: saha/kamp ek + +6.000 kar analizi (ustasız tahsilat raporu) */
    eklerDahil?: boolean;
  }) => {
    const o = summarizeRows(opts.rows);
    const isHakedis = opts.varyant === 'ustasiz';
    const ekler = Boolean(opts.eklerDahil && isHakedis);
    const accent = isHakedis ? '#0f766e' : '#b45309';
    const accentBg = isHakedis ? '#ecfdf5' : '#fffbeb';
    const accentBorder = isHakedis ? '#99f6e4' : '#fde68a';
    const tipLabel = isHakedis ? 'USTASIZ HAKEDİŞ RAPORU' : 'USTALI PERSONEL RAPORU';
    const tipNote = isHakedis
      ? 'Bu rapor ZER YAPI’dan tahsilat / ödeme almak için hazırlanmıştır. Ustasız personel hakediş listesidir.'
      : 'Usta görevli personelin dönem hakediş özetidir (bilgi / iç rapor).';

    const rowsHtml = opts.rows
      .map(
        (r, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:11px">${i + 1}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:700;text-transform:uppercase">${escHtml(`${r.personel.ad} ${r.personel.soyad}`)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${escHtml(normalizeGorev(r.personel.gorev))}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:Consolas,monospace">${r.geldiGun}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:Consolas,monospace">${r.mesaiSaat}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Consolas,monospace;font-weight:800;color:${accent}">${formatMoney(r.zerYapiHakedis, 0)}</td>
      </tr>`
      )
      .join('');

    let karEkHtml = '';
    let faaliyetEkHtml = '';
    if (ekler) {
      const kar = computeKarSlice(opts.rows);
      // Net şirket karı = +6.000 farkı − ZER YAPI ödeneği
      const toplamFayda = kar.zarar - kar.zer;
      const aylik6000Senaryo = opts.rows.reduce((s, r) => {
        const gunluk6000 = TABAN_FARK_TL / daysInMonth(selectedYear, selectedMonth);
        return s + r.geldiGun * gunluk6000;
      }, 0);
      karEkHtml = `
        <section style="margin-top:22px;page-break-inside:avoid">
          <div style="border:2px solid #fecaca;background:linear-gradient(135deg,#fef2f2,#fff7ed);border-radius:14px;padding:16px;margin-bottom:12px">
            <div style="font-size:10px;font-weight:900;letter-spacing:.08em;color:#b91c1c;text-transform:uppercase">
              Net şirket karı · +₺${TABAN_FARK_TL.toLocaleString('tr-TR')} fark − ZER ödeneği
            </div>
            <p style="margin:8px 0 0;font-size:13px;color:#7f1d1d;line-height:1.5;font-weight:600">
              Bu ustasız personel grubu tabanına +₺${TABAN_FARK_TL.toLocaleString('tr-TR')} eklenerek çalışsaydı
              dönem maaş maliyeti <strong>${formatMoney(kar.senaryo, 0)}</strong> olurdu
              (şu anki: ${formatMoney(kar.mevcut, 0)}).
              +6.000 farkı (kaçınılan fazla maaş):
              <strong style="font-size:17px">${formatMoney(kar.zarar, 0)}</strong>.
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#9a3412;line-height:1.45">
              ZER YAPI ödeneği (şirket öder): <strong>${formatMoney(kar.zer, 0)}</strong>
              (₺${ZER_YAPI_GUNLUK}/gün). Net şirket karı
              (+6.000 fark − ZER ödeneği):
              <strong style="font-size:16px;color:#047857">${formatMoney(toplamFayda, 0)}</strong>.
            </p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:8px">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;text-align:center">
              <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">+6.000 farkı</div>
              <div style="font-size:15px;font-weight:900;margin-top:4px;font-family:Consolas,monospace">${formatMoney(kar.zarar, 0)}</div>
            </div>
            <div style="border:1px solid #fecaca;border-radius:12px;padding:12px;background:#fef2f2;text-align:center">
              <div style="font-size:9px;font-weight:800;color:#b91c1c;text-transform:uppercase">− ZER ödeneği</div>
              <div style="font-size:15px;font-weight:900;margin-top:4px;font-family:Consolas,monospace;color:#b91c1c">${formatMoney(kar.zer, 0)}</div>
            </div>
            <div style="border:2px solid #86efac;border-radius:12px;padding:12px;background:#ecfdf5;text-align:center">
              <div style="font-size:9px;font-weight:800;color:#047857;text-transform:uppercase">Net şirket karı</div>
              <div style="font-size:15px;font-weight:900;margin-top:4px;font-family:Consolas,monospace;color:#047857">${formatMoney(toplamFayda, 0)}</div>
            </div>
          </div>
          <p style="margin:0;font-size:11px;color:#78716c;line-height:1.45">
            Formül: (+₺${TABAN_FARK_TL.toLocaleString('tr-TR')} taban farkı) − (ZER ödeneği) = net kar.
            Referans ek gün payı ≈ ${formatMoney(aylik6000Senaryo, 0)}.
          </p>
        </section>`;

      const saha = prepareSahaFaaliyetRaporu(monthlySahaFaaliyetleri as any);
      const kamp = prepareKampFaaliyetRaporu(monthlyKampFaaliyetleri);
      const sahaLimit = saha.slice(0, 80);
      const kampLimit = kamp.slice(0, 40);
      const sahaRows = sahaLimit
        .map(
          (sf, i) => `<tr style="background:${i % 2 ? '#fffbeb' : '#fff'}">
          <td style="padding:5px 6px;border-bottom:1px solid #fde68a;font-size:10px;white-space:nowrap">${escHtml(sf.tarihDate)}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #fde68a;font-size:10px">${escHtml(sf.parselKisa)}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #fde68a;font-size:10px">${escHtml(sf.blokKisa)}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #fde68a;font-size:10px">${escHtml(faaliyetIsTanimi(sf))}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #fde68a;font-size:10px;white-space:nowrap">${escHtml(formatPersonelSayisi(sf))}</td>
        </tr>`
        )
        .join('');
      const kampRows = kampLimit
        .map(
          (k, i) => `<tr style="background:${i % 2 ? '#f0f9ff' : '#fff'}">
          <td style="padding:5px 6px;border-bottom:1px solid #bae6fd;font-size:10px;white-space:nowrap">${escHtml(k.tarihDate || k.tarih)}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #bae6fd;font-size:10px">${escHtml(k.faaliyetTipi || 'Kamp')}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #bae6fd;font-size:10px">${escHtml(k.aciklama || '—')}</td>
        </tr>`
        )
        .join('');

      faaliyetEkHtml = `
        <section style="margin-top:22px;page-break-before:always">
          <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;color:#b45309;letter-spacing:.04em">
            Ek · Saha faaliyetleri (${saha.length}${saha.length > sahaLimit.length ? ` · ilk ${sahaLimit.length}` : ''})
          </h3>
          <p style="margin:0 0 10px;font-size:11px;color:#78716c">
            ${escHtml(donemLabel)} dönemine ait saha / personel faaliyet kayıtları (rapor eki).
          </p>
          ${
            sahaLimit.length === 0
              ? `<p style="font-size:11px;color:#94a3b8;margin:0 0 14px">Bu dönem saha kaydı yok.</p>`
              : `<table style="width:100%;border-collapse:collapse;border:1px solid #fde68a;border-radius:12px;overflow:hidden;margin-bottom:18px">
                  <thead>
                    <tr style="background:#b45309;color:#fff">
                      <th style="padding:7px;text-align:left">Tarih</th>
                      <th style="padding:7px;text-align:left">Parsel</th>
                      <th style="padding:7px;text-align:left">Blok</th>
                      <th style="padding:7px;text-align:left">İş tanımı</th>
                      <th style="padding:7px;text-align:left">Personel</th>
                    </tr>
                  </thead>
                  <tbody>${sahaRows}</tbody>
                </table>`
          }

          <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;color:#0369a1;letter-spacing:.04em">
            Ek · Kamp faaliyetleri (${kamp.length}${kamp.length > kampLimit.length ? ` · ilk ${kampLimit.length}` : ''})
          </h3>
          ${
            kampLimit.length === 0
              ? `<p style="font-size:11px;color:#94a3b8;margin:0">Bu dönem kamp kaydı yok.</p>`
              : `<table style="width:100%;border-collapse:collapse;border:1px solid #bae6fd;border-radius:12px;overflow:hidden">
                  <thead>
                    <tr style="background:#0369a1;color:#fff">
                      <th style="padding:7px;text-align:left">Tarih</th>
                      <th style="padding:7px;text-align:left">Tip</th>
                      <th style="padding:7px;text-align:left">Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>${kampRows}</tbody>
                </table>`
          }
        </section>`;
    }

    return `
      <div style="border:2px solid ${accentBorder};background:${accentBg};border-radius:14px;padding:14px 16px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:900;letter-spacing:.08em;color:${accent};text-transform:uppercase">${tipLabel}</div>
        <p style="margin:6px 0 0;font-size:12px;color:#334155;line-height:1.45">${tipNote}</p>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b">
          Dönem: <strong>${escHtml(donemLabel)}</strong> · Formül: geldi gün × ₺${ZER_YAPI_GUNLUK}
          (aylık ~₺${(ZER_YAPI_GUNLUK * 30).toLocaleString('tr-TR')})
        </p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;text-align:center">
          <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">Personel</div>
          <div style="font-size:20px;font-weight:900;margin-top:4px">${o.kisi}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;text-align:center">
          <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">İş günü</div>
          <div style="font-size:20px;font-weight:900;margin-top:4px">${o.geldi}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;text-align:center">
          <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">Mesai</div>
          <div style="font-size:20px;font-weight:900;margin-top:4px">${o.mesai.toLocaleString('tr-TR')}</div>
        </div>
        <div style="border:2px solid ${accentBorder};border-radius:12px;padding:12px;background:${accentBg};text-align:center">
          <div style="font-size:10px;font-weight:800;color:${accent};text-transform:uppercase">${isHakedis ? 'Tahsil edilecek' : 'ZER toplam'}</div>
          <div style="font-size:20px;font-weight:900;margin-top:4px;color:${accent}">${formatMoney(o.zer, 0)}</div>
        </div>
      </div>

      ${
        isHakedis
          ? `<div style="border:1px solid #99f6e4;background:linear-gradient(135deg,#ecfdf5,#f0fdfa);border-radius:14px;padding:14px 16px;margin-bottom:16px">
              <div style="font-size:11px;font-weight:800;color:#0f766e;text-transform:uppercase">Ödeme / Hakediş Özeti</div>
              <p style="margin:8px 0 0;font-size:13px;color:#134e4a;line-height:1.5">
                <strong>${o.kisi}</strong> ustasız personel · <strong>${o.geldi}</strong> iş-günü × ₺${ZER_YAPI_GUNLUK}
                = <strong style="font-size:16px">${formatMoney(o.zer, 0)}</strong>
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#64748b">Bu tutar ZER YAPI hakediş tahsilatı için esas alınır.</p>
            </div>`
          : ''
      }

      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <thead>
          <tr style="background:${isHakedis ? '#0f766e' : '#b45309'};color:#fff">
            <th style="padding:8px;text-align:center;width:36px">#</th>
            <th style="padding:8px;text-align:left">Ad Soyad</th>
            <th style="padding:8px;text-align:left">Görev</th>
            <th style="padding:8px;text-align:center">Geldi</th>
            <th style="padding:8px;text-align:center">Mesai</th>
            <th style="padding:8px;text-align:right">ZER Hakediş</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8">Kayıt yok</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9;font-weight:800">
            <td colspan="3" style="padding:10px 8px">TOPLAM</td>
            <td style="padding:10px 8px;text-align:center;font-family:Consolas,monospace">${o.geldi}</td>
            <td style="padding:10px 8px;text-align:center;font-family:Consolas,monospace">${o.mesai}</td>
            <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace;color:${accent}">${formatMoney(o.zer, 0)}</td>
          </tr>
        </tfoot>
      </table>

      ${karEkHtml}
      ${faaliyetEkHtml}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px">
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:110px;text-align:center;background:#fff">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#334155">Kibritçi İnşaat</div>
          <div style="height:56px;border-bottom:1px solid #cbd5e1;margin:12px 18px 8px"></div>
          <div style="font-size:10px;color:#94a3b8">İmza / Kaşe</div>
        </div>
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:110px;text-align:center;background:#fff">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#334155">ZER YAPI</div>
          <div style="height:56px;border-bottom:1px solid #cbd5e1;margin:12px 18px 8px"></div>
          <div style="font-size:10px;color:#94a3b8">${isHakedis ? 'Ödeme onayı' : 'İmza / Kaşe'}</div>
        </div>
      </div>
    `;
  };

  const buildKarAnaliziBodyHtml = () => {
    const a = analysisSummary;
    const ustasizKar = computeKarSlice(ustasizRows);
    const ustaliKar = computeKarSlice(ustaliRows);
    const topRows = (a.enCokEtkilenen || [])
      .slice(0, 8)
      .map(
        (p: { adSoyad: string; gorev: string; mevcutToplam: number; senaryoToplam: number; sirketKari: number }, i: number) =>
          `<tr style="background:${i % 2 ? '#fff7ed' : '#fff'}">
            <td style="padding:6px 8px;border-bottom:1px solid #fed7aa;font-weight:700">${escHtml(p.adSoyad)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #fed7aa;font-size:11px;color:#78716c">${escHtml(p.gorev)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace">${formatMoney(p.mevcutToplam, 0)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace">${formatMoney(p.senaryoToplam, 0)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace;font-weight:800;color:#b91c1c">${formatMoney(p.sirketKari, 0)}</td>
          </tr>`
      )
      .join('');

    return `
      <div style="border:2px solid #fecaca;background:linear-gradient(135deg,#fef2f2,#fff7ed);border-radius:14px;padding:16px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:900;letter-spacing:.08em;color:#b91c1c;text-transform:uppercase">Kar / Zarar Analizi · +₺${TABAN_FARK_TL.toLocaleString('tr-TR')} Taban Senaryosu</div>
        <p style="margin:8px 0 0;font-size:13px;color:#7f1d1d;line-height:1.5;font-weight:600">
          Personel tabanı +₺${TABAN_FARK_TL.toLocaleString('tr-TR')} olsaydı şirket
          <strong style="font-size:18px">${formatMoney(a.fazlaMaasOdemesi, 0)}</strong> fazla maaş öderdi
          (kaçınılan zarar / dönem tasarrufu).
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#9a3412;line-height:1.45">
          Gün farkı ${formatMoney(a.gunTasarrufu, 0)} + mesai farkı ${formatMoney(a.mesaiTasarrufu, 0)}.
          ZER ödeneği (₺${ZER_YAPI_GUNLUK}/gün): ${formatMoney(a.zerGeliri, 0)}.
          Net şirket karı (+6.000 fark − ZER): <strong>${formatMoney(a.donemToplamFayda, 0)}</strong>.
        </p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:12px;background:#f8fafc">
          <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">+6.000 farkı</div>
          <div style="font-size:16px;font-weight:900;margin-top:6px;font-family:Consolas,monospace">${formatMoney(a.fazlaMaasOdemesi, 0)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px">Kaçınılan fazla maaş</div>
        </div>
        <div style="border:1px solid #fecaca;border-radius:12px;padding:12px;background:#fef2f2">
          <div style="font-size:10px;font-weight:800;color:#b91c1c;text-transform:uppercase">− ZER ödeneği</div>
          <div style="font-size:16px;font-weight:900;margin-top:6px;font-family:Consolas,monospace;color:#b91c1c">${formatMoney(a.zerGeliri, 0)}</div>
          <div style="font-size:10px;color:#9a3412;margin-top:4px">Şirket öder · ₺${ZER_YAPI_GUNLUK}/gün</div>
        </div>
        <div style="border:2px solid #86efac;border-radius:12px;padding:12px;background:#ecfdf5">
          <div style="font-size:10px;font-weight:800;color:#047857;text-transform:uppercase">Net şirket karı</div>
          <div style="font-size:16px;font-weight:900;margin-top:6px;font-family:Consolas,monospace;color:#047857">${formatMoney(a.donemToplamFayda, 0)}</div>
          <div style="font-size:10px;color:#065f46;margin-top:4px">+6.000 fark − ZER</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff">
          <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">Şuanki maaş</div>
          <div style="font-size:16px;font-weight:900;margin-top:6px;font-family:Consolas,monospace">${formatMoney(totalMaasKazanci, 0)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px">${activeStaffRows.length} personel</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff">
          <div style="font-size:10px;font-weight:900;color:#b45309;text-transform:uppercase">Ustalı dilim</div>
          <p style="margin:8px 0 0;font-size:12px;color:#334155;line-height:1.45">
            ${ustaliKar.kisi} kişi · ZER ${formatMoney(ustaliKar.zer, 0)}<br/>
            +6.000 olsaydı fazla ödeme: <strong style="color:#b91c1c">${formatMoney(ustaliKar.zarar, 0)}</strong>
          </p>
        </div>
        <div style="border:1px solid #99f6e4;border-radius:12px;padding:12px;background:#f0fdfa">
          <div style="font-size:10px;font-weight:900;color:#0f766e;text-transform:uppercase">Ustasız dilim (hakediş)</div>
          <p style="margin:8px 0 0;font-size:12px;color:#334155;line-height:1.45">
            ${ustasizKar.kisi} kişi · ZER hakediş <strong>${formatMoney(ustasizKar.zer, 0)}</strong><br/>
            +6.000 olsaydı fazla ödeme: <strong style="color:#b91c1c">${formatMoney(ustasizKar.zarar, 0)}</strong>
          </p>
        </div>
      </div>

      <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;color:#9a3412;letter-spacing:.04em">
        En çok etkilenen personel (kaçınılan fazla maaş)
      </h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #fed7aa;border-radius:12px;overflow:hidden;margin-bottom:12px">
        <thead>
          <tr style="background:#c2410c;color:#fff">
            <th style="padding:8px;text-align:left">Ad Soyad</th>
            <th style="padding:8px;text-align:left">Görev</th>
            <th style="padding:8px;text-align:right">Mevcut</th>
            <th style="padding:8px;text-align:right">+6.000</th>
            <th style="padding:8px;text-align:right">Fark</th>
          </tr>
        </thead>
        <tbody>${topRows || `<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8">Veri yok</td></tr>`}</tbody>
      </table>
      <p style="margin:0;font-size:11px;color:#78716c;line-height:1.45">${escHtml(a.güçlüArgüman)}</p>
    `;
  };

  const publishHtmlReport = (opts: {
    title: string;
    subtitle: string;
    meta: string[];
    bodyHtml: string;
    fileName: string;
    openPrint?: boolean;
  }) => {
    const html = buildKibritciReportHtml({
      title: opts.title,
      subtitle: opts.subtitle,
      meta: opts.meta,
      bodyHtml: opts.bodyHtml,
    });
    downloadKibritciReportHtml(html, opts.fileName);
    if (opts.openPrint) openKibritciReportPrint(html, opts.title);
  };

  const handleUstaUstasizRaporlar = () => {
    setDownloadingReport(true);
    try {
      // 1) Ustasız = ana hakediş / tahsilat raporu (+ saha/kamp ek + 6.000 fayda analizi)
      const ustasizOzet = summarizeRows(ustasizRows);
      const ustasizKar = computeKarSlice(ustasizRows);
      publishHtmlReport({
        title: 'ZER YAPI HAKEDİŞ RAPORU',
        subtitle: `Ustasız Personel · ${donemLabel}`,
        meta: [
          `Personel: ${ustasizRows.length}`,
          `İş günü: ${ustasizOzet.geldi}`,
          `Tahsil: ${formatMoney(ustasizOzet.zer, 0)}`,
          `Net kar: ${formatMoney(ustasizKar.zarar - ustasizKar.zer, 0)}`,
        ],
        bodyHtml: buildPersonelHakedisBodyHtml({
          rows: ustasizRows,
          varyant: 'ustasiz',
          eklerDahil: true,
        }),
        fileName: `ZER_YAPI_Hakedis_Ustasiz_${donemKey}.html`,
        openPrint: true,
      });

      // 2) Ustalı iç rapor
      setTimeout(() => {
        publishHtmlReport({
          title: 'ZER YAPI USTALI PERSONEL',
          subtitle: `Ustalı Liste · ${donemLabel}`,
          meta: [
            `Personel: ${ustaliRows.length}`,
            `ZER: ${formatMoney(summarizeRows(ustaliRows).zer, 0)}`,
          ],
          bodyHtml: buildPersonelHakedisBodyHtml({ rows: ustaliRows, varyant: 'ustali' }),
          fileName: `ZER_YAPI_Ustali_${donemKey}.html`,
          openPrint: true,
        });
      }, 350);

      // 3) Kar analizi (+6.000 zarar senaryosu)
      setTimeout(() => {
        publishHtmlReport({
          title: 'ZER YAPI KAR ANALİZİ',
          subtitle: `+₺${TABAN_FARK_TL.toLocaleString('tr-TR')} taban olsaydı · ${donemLabel}`,
          meta: [
            `+6.000 fark: ${formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}`,
            `ZER ödeneği: ${formatMoney(analysisSummary.zerGeliri, 0)}`,
            `Net kar: ${formatMoney(analysisSummary.donemToplamFayda, 0)}`,
          ],
          bodyHtml: buildKarAnaliziBodyHtml(),
          fileName: `ZER_YAPI_Kar_Analizi_6000_${donemKey}.html`,
          openPrint: true,
        });
      }, 700);

      showStatus(
        'success',
        `HTML raporlar: Ustasız hakediş+saha/kamp+fayda · Ustalı · Kar analizi`
      );
    } catch (err: any) {
      showStatus('error', `HTML rapor oluşturulamadı: ${err?.message || err}`);
    } finally {
      setDownloadingReport(false);
    }
  };

  const toggleTopluAy = (ay: number) => {
    setTopluAySecimler((prev) =>
      prev.includes(ay) ? prev.filter((x) => x !== ay) : [...prev, ay].sort((a, b) => a - b)
    );
  };

  const handleTopluAyUstasizRapor = () => {
    const aylar = [...topluAySecimler].sort((a, b) => a - b);
    if (!aylar.length) {
      showStatus('error', 'En az bir ay seçin.');
      return;
    }
    setTopluAyBusy(true);
    try {
      type AyBlok = {
        ay: number;
        label: string;
        rows: StaffHakedisRow[];
        ozet: ReturnType<typeof summarizeRows>;
        kar: ReturnType<typeof computeKarSlice>;
        saha: ReturnType<typeof prepareSahaFaaliyetRaporu>;
        kamp: ReturnType<typeof prepareKampFaaliyetRaporu>;
      };

      const bloklar: AyBlok[] = aylar.map((ay) => {
        const all = buildRowsForMonth(topluAyYil, ay).filter(
          (r) => !excludedStaffIds.includes(r.personel.id) && !isUstaGorev(r.personel.gorev)
        );
        const saha = prepareSahaFaaliyetRaporu(
          filterByMonth(tumSahaFaaliyetleri, topluAyYil, ay) as any
        );
        const kamp = prepareKampFaaliyetRaporu(filterByMonth(kampFaaliyetleri, topluAyYil, ay));
        return {
          ay,
          label: `${TURKISH_MONTHS[ay - 1]} ${topluAyYil}`,
          rows: all,
          ozet: summarizeRows(all),
          kar: computeKarSlice(all, topluAyYil, ay),
          saha,
          kamp,
        };
      });

      const ustaliBloklar = aylar.map((ay) => {
        const all = buildRowsForMonth(topluAyYil, ay).filter(
          (r) => !excludedStaffIds.includes(r.personel.id) && isUstaGorev(r.personel.gorev)
        );
        return {
          ay,
          label: `${TURKISH_MONTHS[ay - 1]} ${topluAyYil}`,
          ozet: summarizeRows(all),
          kar: computeKarSlice(all, topluAyYil, ay),
        };
      });

      const genelZer = bloklar.reduce((s, b) => s + b.ozet.zer, 0);
      const genelGun = bloklar.reduce((s, b) => s + b.ozet.geldi, 0);
      const genelKisiMax = Math.max(0, ...bloklar.map((b) => b.ozet.kisi));
      const genelMevcut = bloklar.reduce((s, b) => s + b.kar.mevcut, 0);
      const genelSenaryo = bloklar.reduce((s, b) => s + b.kar.senaryo, 0);
      const genelKar = genelSenaryo - genelMevcut;
      // Net şirket karı = +6.000 farkı − ZER YAPI ödeneği
      const genelProjeYarari = genelKar - genelZer;
      const ustaliZer = ustaliBloklar.reduce((s, b) => s + b.ozet.zer, 0);
      const ustaliGun = ustaliBloklar.reduce((s, b) => s + b.ozet.geldi, 0);
      const ustaliKisiMax = Math.max(0, ...ustaliBloklar.map((b) => b.ozet.kisi));
      const donemAralik = bloklar.map((b) => TURKISH_MONTHS[b.ay - 1]).join(' · ');
      const fileKey = `${topluAyYil}_${aylar.map((a) => String(a).padStart(2, '0')).join('-')}`;

      const ayOdemeTablosu = bloklar
        .map(
          (b, i) => {
            const ayNetKar = b.kar.zarar - b.ozet.zer;
            return `<tr style="background:${i % 2 ? '#f0fdfa' : '#fff'}">
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;font-weight:800">${escHtml(b.label)}</td>
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;text-align:center;font-family:Consolas,monospace">${b.ozet.kisi}</td>
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;text-align:center;font-family:Consolas,monospace">${b.ozet.geldi}</td>
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;text-align:center;font-family:Consolas,monospace">${b.ozet.mesai}</td>
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;text-align:right;font-family:Consolas,monospace;font-size:11px;color:#047857">${formatMoney(b.kar.zarar, 0)}</td>
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;text-align:right;font-family:Consolas,monospace;font-weight:900;color:#b91c1c">${formatMoney(b.ozet.zer, 0)}</td>
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;text-align:right;font-family:Consolas,monospace;font-weight:900;color:#047857">${formatMoney(ayNetKar, 0)}</td>
          <td style="padding:8px;border-bottom:1px solid #ccfbf1;text-align:center;font-size:11px;color:#64748b">${b.saha.length} saha · ${b.kamp.length} kamp</td>
        </tr>`;
          }
        )
        .join('');

      const ayKarTablosu = bloklar
        .map(
          (b, i) => `<tr style="background:${i % 2 ? '#fff7ed' : '#fff'}">
          <td style="padding:7px 8px;border-bottom:1px solid #fed7aa;font-weight:700">${escHtml(b.label)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace">${formatMoney(b.kar.mevcut, 0)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace;color:#b91c1c">${formatMoney(b.kar.senaryo, 0)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace;font-weight:800;color:#047857">${formatMoney(b.kar.zarar, 0)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace;color:#0f766e">${formatMoney(b.ozet.zer, 0)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #fed7aa;text-align:right;font-family:Consolas,monospace;font-weight:900;color:#047857">${formatMoney(b.kar.zarar - b.ozet.zer, 0)}</td>
        </tr>`
        )
        .join('');

      const ayDetayHtml = bloklar
        .map((b) => {
          const personelRows = b.rows
            .map(
              (r, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
              <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:10px">${i + 1}</td>
              <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;font-weight:700;text-transform:uppercase;font-size:11px">${escHtml(`${r.personel.ad} ${r.personel.soyad}`)}</td>
              <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#64748b">${escHtml(normalizeGorev(r.personel.gorev))}</td>
              <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:Consolas,monospace;font-size:11px">${r.geldiGun}</td>
              <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:Consolas,monospace;font-size:11px">${r.mesaiSaat}</td>
              <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:Consolas,monospace;font-weight:800;color:#0f766e;font-size:11px">${formatMoney(r.zerYapiHakedis, 0)}</td>
            </tr>`
            )
            .join('');

          const sahaLimit = b.saha.slice(0, 60);
          const sahaRows = sahaLimit
            .map(
              (sf, i) => `<tr style="background:${i % 2 ? '#fffbeb' : '#fff'}">
              <td style="padding:4px 6px;border-bottom:1px solid #fde68a;font-size:10px;white-space:nowrap">${escHtml(sf.tarihDate)}</td>
              <td style="padding:4px 6px;border-bottom:1px solid #fde68a;font-size:10px">${escHtml(sf.parselKisa)}</td>
              <td style="padding:4px 6px;border-bottom:1px solid #fde68a;font-size:10px">${escHtml(sf.blokKisa)}</td>
              <td style="padding:4px 6px;border-bottom:1px solid #fde68a;font-size:10px">${escHtml(faaliyetIsTanimi(sf))}</td>
              <td style="padding:4px 6px;border-bottom:1px solid #fde68a;font-size:10px;white-space:nowrap">${escHtml(formatPersonelSayisi(sf))}</td>
            </tr>`
            )
            .join('');

          const ayNetKar = b.kar.zarar - b.ozet.zer;
          return `
            <section style="margin:22px 0;page-break-inside:avoid">
              <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px;padding:10px 12px;border-radius:12px;background:linear-gradient(135deg,#ecfdf5,#f0fdfa);border:1px solid #99f6e4">
                <div>
                  <div style="font-size:10px;font-weight:900;letter-spacing:.06em;color:#0f766e;text-transform:uppercase">Aylık ustasız hakediş</div>
                  <div style="font-size:16px;font-weight:900;color:#134e4a">${escHtml(b.label)}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">ZER ödeneği</div>
                  <div style="font-size:18px;font-weight:900;color:#b91c1c;font-family:Consolas,monospace">${formatMoney(b.ozet.zer, 0)}</div>
                  <div style="font-size:10px;color:#64748b">${b.ozet.kisi} kişi · ${b.ozet.geldi} gün × ₺${ZER_YAPI_GUNLUK}</div>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px">
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px;text-align:center;background:#fff">
                  <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">+6.000 farkı</div>
                  <div style="font-size:14px;font-weight:900;font-family:Consolas,monospace">${formatMoney(b.kar.zarar, 0)}</div>
                </div>
                <div style="border:1px solid #fecaca;border-radius:10px;padding:8px;text-align:center;background:#fef2f2">
                  <div style="font-size:9px;font-weight:800;color:#b91c1c;text-transform:uppercase">− ZER ödeneği</div>
                  <div style="font-size:14px;font-weight:900;font-family:Consolas,monospace;color:#b91c1c">${formatMoney(b.ozet.zer, 0)}</div>
                </div>
                <div style="border:2px solid #86efac;border-radius:10px;padding:8px;text-align:center;background:#ecfdf5">
                  <div style="font-size:9px;font-weight:800;color:#047857;text-transform:uppercase">Net şirket karı</div>
                  <div style="font-size:14px;font-weight:900;font-family:Consolas,monospace;color:#047857">${formatMoney(ayNetKar, 0)}</div>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px">
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px;text-align:center;background:#fff"><div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Personel</div><div style="font-size:15px;font-weight:900">${b.ozet.kisi}</div></div>
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px;text-align:center;background:#fff"><div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">İş günü</div><div style="font-size:15px;font-weight:900">${b.ozet.geldi}</div></div>
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px;text-align:center;background:#fff"><div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Mesai</div><div style="font-size:15px;font-weight:900">${b.ozet.mesai}</div></div>
                <div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px;text-align:center;background:#fff"><div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Saha kaydı</div><div style="font-size:15px;font-weight:900">${b.saha.length}</div></div>
              </div>

              <h4 style="margin:0 0 6px;font-size:11px;font-weight:900;text-transform:uppercase;color:#0f766e;letter-spacing:.04em">Ustasız personel hakediş listesi</h4>
              <table style="width:100%;border-collapse:collapse;margin-bottom:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
                <thead>
                  <tr style="background:#0f766e;color:#fff">
                    <th style="padding:6px;width:28px">#</th>
                    <th style="padding:6px;text-align:left">Ad Soyad</th>
                    <th style="padding:6px;text-align:left">Görev</th>
                    <th style="padding:6px;text-align:center">Geldi</th>
                    <th style="padding:6px;text-align:center">Mesai</th>
                    <th style="padding:6px;text-align:right">ZER</th>
                  </tr>
                </thead>
                <tbody>${personelRows || `<tr><td colspan="6" style="padding:12px;text-align:center;color:#94a3b8">Bu ay ustasız kayıt yok</td></tr>`}</tbody>
                <tfoot>
                  <tr style="background:#ecfdf5;font-weight:800">
                    <td colspan="3" style="padding:8px">AY TOPLAMI</td>
                    <td style="padding:8px;text-align:center;font-family:Consolas,monospace">${b.ozet.geldi}</td>
                    <td style="padding:8px;text-align:center;font-family:Consolas,monospace">${b.ozet.mesai}</td>
                    <td style="padding:8px;text-align:right;font-family:Consolas,monospace;color:#0f766e">${formatMoney(b.ozet.zer, 0)}</td>
                  </tr>
                </tfoot>
              </table>

              <h4 style="margin:0 0 6px;font-size:11px;font-weight:900;text-transform:uppercase;color:#b45309;letter-spacing:.04em">
                Saha faaliyet kayıtları (${b.saha.length}${b.saha.length > sahaLimit.length ? ` · ilk ${sahaLimit.length}` : ''})
              </h4>
              ${
                sahaLimit.length === 0
                  ? `<p style="font-size:11px;color:#94a3b8;margin:0 0 8px">Bu ay saha kaydı yok.</p>`
                  : `<table style="width:100%;border-collapse:collapse;border:1px solid #fde68a;border-radius:10px;overflow:hidden;margin-bottom:8px">
                      <thead>
                        <tr style="background:#b45309;color:#fff">
                          <th style="padding:6px;text-align:left">Tarih</th>
                          <th style="padding:6px;text-align:left">Parsel</th>
                          <th style="padding:6px;text-align:left">Blok</th>
                          <th style="padding:6px;text-align:left">İş tanımı</th>
                          <th style="padding:6px;text-align:left">Personel</th>
                        </tr>
                      </thead>
                      <tbody>${sahaRows}</tbody>
                    </table>`
              }
              ${
                b.kamp.length
                  ? `<p style="margin:0;font-size:11px;color:#64748b">Kamp faaliyet: <strong>${b.kamp.length}</strong> kayıt (özet).</p>`
                  : ''
              }
            </section>`;
        })
        .join('');

      const bodyHtml = `
        <div style="border:2px solid #99f6e4;background:linear-gradient(135deg,#ecfdf5,#f8fafc);border-radius:14px;padding:16px;margin-bottom:16px">
          <div style="font-size:10px;font-weight:900;letter-spacing:.08em;color:#0f766e;text-transform:uppercase">Toplu ay · Ustasız ZER YAPI Hakediş</div>
          <p style="margin:8px 0 0;font-size:13px;color:#134e4a;line-height:1.5;font-weight:600">
            Seçilen dönem: <strong>${escHtml(donemAralik)} ${topluAyYil}</strong>
          </p>
          <p style="margin:6px 0 0;font-size:12px;color:#64748b;line-height:1.45">
            ZER ödeneği: geldi gün × ₺${ZER_YAPI_GUNLUK}. Net şirket karı:
            <strong>(+₺${TABAN_FARK_TL.toLocaleString('tr-TR')} fark) − (ZER ödeneği)</strong>.
            Her ayın saha kayıtları ve net karı ayrıca listelenir.
          </p>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px">
          <div style="border:2px solid #fde68a;border-radius:12px;padding:12px;background:#fffbeb">
            <div style="font-size:10px;font-weight:900;color:#b45309;text-transform:uppercase">Ustalı ZER (aynı dönem)</div>
            <div style="font-size:20px;font-weight:900;margin-top:4px;color:#b45309;font-family:Consolas,monospace">${formatMoney(ustaliZer, 0)}</div>
            <div style="font-size:10px;color:#92400e;margin-top:4px">max ${ustaliKisiMax} kişi/ay · ${ustaliGun} iş-günü</div>
          </div>
          <div style="border:2px solid #fecaca;border-radius:12px;padding:12px;background:#fef2f2">
            <div style="font-size:10px;font-weight:900;color:#b91c1c;text-transform:uppercase">Ustasız ZER ödeneği (−)</div>
            <div style="font-size:20px;font-weight:900;margin-top:4px;color:#b91c1c;font-family:Consolas,monospace">${formatMoney(genelZer, 0)}</div>
            <div style="font-size:10px;color:#9a3412;margin-top:4px">${bloklar.length} ay · ${genelGun} iş-günü × ₺${ZER_YAPI_GUNLUK} · kardan düşülür</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px">
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;text-align:center">
            <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">+6.000 farkı</div>
            <div style="font-size:18px;font-weight:900;margin-top:4px;font-family:Consolas,monospace">${formatMoney(genelKar, 0)}</div>
            <div style="font-size:9px;color:#64748b;margin-top:3px">${bloklar.length} ay · kaçınılan fazla maaş</div>
          </div>
          <div style="border:1px solid #fecaca;border-radius:12px;padding:12px;background:#fef2f2;text-align:center">
            <div style="font-size:10px;font-weight:800;color:#b91c1c;text-transform:uppercase">− ZER ödeneği</div>
            <div style="font-size:18px;font-weight:900;margin-top:4px;font-family:Consolas,monospace;color:#b91c1c">${formatMoney(genelZer, 0)}</div>
            <div style="font-size:9px;color:#9a3412;margin-top:3px">Şirket öder</div>
          </div>
          <div style="border:2px solid #86efac;border-radius:12px;padding:12px;background:#ecfdf5;text-align:center">
            <div style="font-size:10px;font-weight:800;color:#047857;text-transform:uppercase">Net şirket karı</div>
            <div style="font-size:20px;font-weight:900;margin-top:4px;font-family:Consolas,monospace;color:#047857">${formatMoney(genelProjeYarari, 0)}</div>
            <div style="font-size:9px;color:#065f46;margin-top:3px">${formatMoney(genelKar, 0)} − ${formatMoney(genelZer, 0)}</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;text-align:center">
            <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase">Şu an maaş / +6.000</div>
            <div style="font-size:13px;font-weight:900;margin-top:4px;font-family:Consolas,monospace">${formatMoney(genelMevcut, 0)}</div>
            <div style="font-size:11px;font-weight:800;color:#b91c1c;margin-top:2px;font-family:Consolas,monospace">${formatMoney(genelSenaryo, 0)}</div>
          </div>
        </div>

        <div style="border:2px solid #fecaca;background:linear-gradient(135deg,#fef2f2,#fff7ed);border-radius:14px;padding:14px 16px;margin-bottom:16px">
          <div style="font-size:10px;font-weight:900;letter-spacing:.06em;color:#b91c1c;text-transform:uppercase">Toplam kar analizi · +₺${TABAN_FARK_TL.toLocaleString('tr-TR')} fark − ZER ödeneği</div>
          <p style="margin:8px 0 0;font-size:13px;color:#7f1d1d;line-height:1.5;font-weight:600">
            Ustasız personel tabanına +₺${TABAN_FARK_TL.toLocaleString('tr-TR')} eklenerek çalışsaydı dönem maaş ödemesi
            <strong>${formatMoney(genelSenaryo, 0)}</strong> olacaktı.
            Şu anda ödenen: <strong>${formatMoney(genelMevcut, 0)}</strong>.
            Aradaki +6.000 farkı:
            <strong style="font-size:17px;color:#047857">${formatMoney(genelKar, 0)}</strong>.
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#9a3412;line-height:1.45">
            ZER YAPI ödeneği <strong>${formatMoney(genelZer, 0)}</strong> bu farktan çıkarılır.
            Net şirket karı (+6.000 fark − ZER):
            <strong style="font-size:16px;color:#047857">${formatMoney(genelProjeYarari, 0)}</strong>.
          </p>
        </div>

        <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;color:#0f766e;letter-spacing:.04em">
          Ay bazlı ödeme ve net kar özeti
        </h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #99f6e4;border-radius:12px;overflow:hidden;margin-bottom:8px">
          <thead>
            <tr style="background:#0f766e;color:#fff">
              <th style="padding:8px;text-align:left">Ay</th>
              <th style="padding:8px;text-align:center">Kişi</th>
              <th style="padding:8px;text-align:center">Gün</th>
              <th style="padding:8px;text-align:center">Mesai</th>
              <th style="padding:8px;text-align:right">+6.000 fark</th>
              <th style="padding:8px;text-align:right">− ZER ödeneği</th>
              <th style="padding:8px;text-align:right">Net kar</th>
              <th style="padding:8px;text-align:center">Saha / Kamp</th>
            </tr>
          </thead>
          <tbody>${ayOdemeTablosu}</tbody>
          <tfoot>
            <tr style="background:#134e4a;color:#ecfdf5;font-weight:900">
              <td style="padding:10px 8px" colspan="2">GENEL TOPLAM</td>
              <td style="padding:10px 8px;text-align:center;font-family:Consolas,monospace">${genelGun}</td>
              <td style="padding:10px 8px;text-align:center">—</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace;font-size:13px">${formatMoney(genelKar, 0)}</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace;font-size:13px;color:#fecaca">${formatMoney(genelZer, 0)}</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace;font-size:14px">${formatMoney(genelProjeYarari, 0)}</td>
              <td style="padding:10px 8px;text-align:center;font-size:11px">max ${genelKisiMax} kişi/ay</td>
            </tr>
          </tfoot>
        </table>
        <p style="margin:0 0 14px;font-size:11px;color:#64748b">
          Formül: (+₺${TABAN_FARK_TL.toLocaleString('tr-TR')} taban farkı) − (ZER ödeneği = ${genelGun} gün × ₺${ZER_YAPI_GUNLUK}) = net şirket karı.
        </p>

        <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;color:#c2410c;letter-spacing:.04em">
          Ay bazlı maaş / net kar detayı
        </h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #fed7aa;border-radius:12px;overflow:hidden;margin-bottom:16px">
          <thead>
            <tr style="background:#c2410c;color:#fff">
              <th style="padding:8px;text-align:left">Ay</th>
              <th style="padding:8px;text-align:right">Şu an maaş</th>
              <th style="padding:8px;text-align:right">+6.000 senaryo</th>
              <th style="padding:8px;text-align:right">+6.000 fark</th>
              <th style="padding:8px;text-align:right">− ZER</th>
              <th style="padding:8px;text-align:right">Net kar</th>
            </tr>
          </thead>
          <tbody>${ayKarTablosu}</tbody>
          <tfoot>
            <tr style="background:#7f1d1d;color:#fff;font-weight:900">
              <td style="padding:10px 8px">GENEL KAR</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace">${formatMoney(genelMevcut, 0)}</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace">${formatMoney(genelSenaryo, 0)}</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace">${formatMoney(genelKar, 0)}</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace">${formatMoney(genelZer, 0)}</td>
              <td style="padding:10px 8px;text-align:right;font-family:Consolas,monospace;font-size:14px">${formatMoney(genelProjeYarari, 0)}</td>
            </tr>
          </tfoot>
        </table>

        ${ayDetayHtml}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px;page-break-inside:avoid">
          <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:110px;text-align:center;background:#fff">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#334155">Kibritçi İnşaat</div>
            <div style="height:56px;border-bottom:1px solid #cbd5e1;margin:12px 18px 8px"></div>
            <div style="font-size:10px;color:#94a3b8">İmza / Kaşe</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:110px;text-align:center;background:#fff">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#334155">ZER YAPI</div>
            <div style="height:56px;border-bottom:1px solid #cbd5e1;margin:12px 18px 8px"></div>
            <div style="font-size:10px;color:#94a3b8">Toplu ödeme onayı · ${formatMoney(genelZer, 0)}</div>
          </div>
        </div>
      `;

      publishHtmlReport({
        title: 'ZER YAPI TOPLU HAKEDİŞ',
        subtitle: `Ustasız · ${donemAralik} ${topluAyYil}`,
        meta: [
          `${bloklar.length} ay`,
          `Ustasız ZER: ${formatMoney(genelZer, 0)}`,
          `Ustalı ZER: ${formatMoney(ustaliZer, 0)}`,
          `Net kar: ${formatMoney(genelProjeYarari, 0)}`,
        ],
        bodyHtml,
        fileName: `ZER_YAPI_Toplu_Ustasiz_${fileKey}.html`,
        openPrint: true,
      });

      setShowTopluAyModal(false);
      showStatus(
        'success',
        `Toplu rapor: ${bloklar.length} ay · ZER ${formatMoney(genelZer, 0)} · net kar ${formatMoney(genelProjeYarari, 0)}`
      );
    } catch (err: any) {
      showStatus('error', `Toplu ay raporu oluşturulamadı: ${err?.message || err}`);
    } finally {
      setTopluAyBusy(false);
    }
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(shareableSummary);
      setCopiedSummary(true);
      showStatus('success', 'Sunum metni panoya kopyalandı.');
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      showStatus('error', 'Panoya kopyalama sırasında bir sorun oluştu.');
    }
  };

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
        analiz: {
          roleMix: analysisSummary.roleMix,
          ortalamaKisiBasiKar: analysisSummary.ortalamaKisiBasiKar,
          gunBasiKar: analysisSummary.gunBasiKar,
          güçlüArgüman: analysisSummary.güçlüArgüman,
          senaryoMaasTabani: analysisSummary.senaryoMaasTabani,
          mevcutMasraf: totalMaasKazanci,
          senaryoMasraf: analysisSummary.senaryoToplamMasraf,
          masrafArtisi: analysisSummary.masrafArtisi,
          gunMasrafArtisi: analysisSummary.gunMasrafArtisi,
          mesaiMasrafArtisi: analysisSummary.mesaiMasrafArtisi,
        },
      });
      showStatus('success', `${donemLabel} ZER YAPI Hakediş Raporu kaydedildi!`);
    } catch (err: any) {
      showStatus('error', `Rapor kaydedilirken hata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnalysisReport = async () => {
    setLoading(true);
    try {
      const reportId = `ZER-YAPI-ANALIZ-${donemKey}-${Date.now()}`;
      await saveDocument('kibarHakedisRaporlari', {
        id: reportId,
        donem: donemKey,
        donemLabel,
        yil: selectedYear,
        ay: selectedMonth,
        raporTipi: 'ZER_YAPI_6000_TABAN_KAR_ANALIZ',
        durum: 'ANALIZ_KAYDEDİLDİ',
        personelSayisi: activeStaffRows.length,
        toplamCalismaGunu: totalPersonDays,
        toplamMesaiSaat: totalMesaiSaat,
        toplamTutar: totalZerYapiHakedis,
        birimFiyat: ZER_YAPI_GUNLUK,
        toplamMaasKazanci: totalMaasKazanci,
        ortalamaKisiBasiKar: analysisSummary.ortalamaKisiBasiKar,
        gunBasiKar: analysisSummary.gunBasiKar,
        roleMix: analysisSummary.roleMix,
        güçlüArgüman: analysisSummary.güçlüArgüman,
        tabanFarkTl: TABAN_FARK_TL,
        senaryoToplamMasraf: analysisSummary.senaryoToplamMasraf,
        gunTasarrufu: analysisSummary.gunTasarrufu,
        mesaiTasarrufu: analysisSummary.mesaiTasarrufu,
        aylikSirketKari: analysisSummary.aylikSirketKari,
        mesaiPayiPct: analysisSummary.mesaiPayiPct,
        olusturan: currentUser?.email || 'sametatak9@gmail.com',
        olusturmaTarihi: new Date().toISOString(),
      });
      showStatus('success', `${donemLabel} +6.000 taban / aylık şirket kârı analizi kaydedildi!`);
    } catch (err: any) {
      showStatus('error', `Analiz raporu kaydedilirken hata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const buildReportHtmlDocument = (content: string): string => `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>ZER_YAPI_Fark_Zarar_${donemKey}</title><style>body{margin:0;padding:24px;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;background:#f8fafc;}${getCorporateReportCss()}${REPORT_CSS}</style></head><body><div class="report-root">${content}</div></body></html>`;

  const handleDownloadHtml = () => {
    const printContent = document.getElementById('kibar-report-print-area')?.innerHTML;
    if (!printContent) return;
    const html = buildReportHtmlDocument(printContent);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZER_YAPI_Hakedis_${donemKey}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('success', 'Rapor HTML olarak indiriliyor.');
  };

  const handleDownloadExcel = async () => {
    setDownloadingReport(true);
    try {
      const { createExcelWorkbook } = await import('../lib/exceljsLoader');
      const wb = await createExcelWorkbook();
      const ws = wb.addWorksheet('ZER YAPI Rapor');
      // Header + rich summary
      ws.addRow(['ZER YAPI HAKEDİŞ RAPORU', donemLabel]);
      ws.addRow([]);
      ws.addRow(['Personel Sayısı', activeStaffRows.length]);
      ws.addRow(['Toplam İş Günü', totalPersonDays]);
      ws.addRow(['Toplam Mesai Saati', totalMesaiSaat]);
      ws.addRow(['Toplam Maaş Kazancı', formatMoney(totalMaasKazanci)]);
      ws.addRow(['Toplam Gün Kazancı', formatMoney(totalGunKazanci)]);
      ws.addRow(['Toplam ZER YAPI Tutarı', formatMoney(totalZerYapiHakedis, 0)]);
      ws.addRow(['Kişi Başı Ortalama ZER YAPI', formatMoney(analysisSummary.ortalamaKisiBasiKar, 0)]);
      ws.addRow(['Gün Başı Ortalama ZER YAPI', formatMoney(analysisSummary.gunBasiKar, 0)]);
      ws.addRow([]);
      ws.addRow(['+6000 TABAN ANALİZİ (GÜN+MESAİ)', `mevcut + ${formatMoney(TABAN_FARK_TL, 0)}`]);
      ws.addRow(['Şuanki toplam masraf', formatMoney(totalMaasKazanci, 0)]);
      ws.addRow(['+6000 toplam masraf', formatMoney(analysisSummary.senaryoToplamMasraf, 0)]);
      ws.addRow(['Gün tasarrufu', formatMoney(analysisSummary.gunTasarrufu, 0)]);
      ws.addRow(['Mesai tasarrufu (dahil ✓)', formatMoney(analysisSummary.mesaiTasarrufu, 0)]);
      ws.addRow(['Aylık şirket kârı', formatMoney(analysisSummary.aylikSirketKari, 0)]);
      ws.addRow(['Mesai payı %', analysisSummary.mesaiPayiPct]);
      ws.addRow([]);

      // Role mix breakdown
      ws.addRow(['Rol Dağılım']);
      const rm = analysisSummary.roleMix || { duzIsci: 0, usta: 0, formen: 0, senior: 0, diger: 0 };
      ws.addRow(['Düz işçi', rm.duzIsci]);
      ws.addRow(['Usta', rm.usta]);
      ws.addRow(['Formen', rm.formen]);
      ws.addRow(['Senior', rm.senior]);
      ws.addRow(['Diğer', rm.diger]);
      ws.addRow([]);

      // Sunum / özet metni
      ws.addRow(['Güçlü Analiz Metni']);
      const summary = String(analysisSummary.güçlüArgüman || shareableSummary || '');
      summary.split(/\n+/).filter(Boolean).forEach((s) => ws.addRow([s.trim()]));
      ws.addRow([]);

      // Senaryo personel detay
      ws.addRow(['Senaryo Personel Detayı']);
      const scenarioHeader = [
        'Ad Soyad', 'Görev', 'Şuanki Taban', '+6000 Taban', 'Geldi', 'Mesai Sa',
        'Şuanki Toplam', '+6000 Toplam', 'Şirket Kârı', 'Gün Δ', 'Mesai Δ',
      ];
      const scenarioHeaderRow = ws.addRow(scenarioHeader);
      scenarioHeaderRow.font = { bold: true };
      analysisSummary.personelSenaryolari.forEach((p) => {
        ws.addRow([
          p.adSoyad,
          p.gorev,
          p.mevcutTaban,
          p.senaryoTaban,
          p.geldiGun,
          p.mesaiSaat,
          p.mevcutToplam,
          p.senaryoToplam,
          p.sirketKari,
          p.gunFarki,
          p.mesaiFarki,
        ]);
      });
      ws.addRow([]);

      // Personel detay başlığı
      const header = ['Ad Soyad', 'Görev', 'Geldi Gün', 'Mesai Saat', 'Gün Kazancı', 'Mesai Kazancı', 'Toplam Maaş', 'ZER YAPI Hakedis'];
      const headerRow = ws.addRow(header);
      headerRow.font = { bold: true };
      activeStaffRows.forEach((row) => {
        ws.addRow([
          `${row.personel.ad} ${row.personel.soyad}`,
          normalizeGorev(row.personel.gorev),
          row.geldiGun,
          row.mesaiSaat,
          row.gunKazanci,
          row.mesaiKazanci,
          row.toplamKazanc,
          row.zerYapiHakedis,
        ]);
      });
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ZER_YAPI_Hakedis_${donemKey}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('success', 'Rapor Excel olarak indirildi.');
    } catch (err: any) {
      showStatus('error', `Excel raporu oluşturulamadı: ${err?.message || err}`);
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingReport(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = 16;
      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`ZER YAPI Hakediş Raporu — ${donemLabel}`, margin, y);
      y += 8;

      // Top summary + comparison
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const topLines = [
        `Personel sayısı: ${activeStaffRows.length} · Toplam iş günü: ${totalPersonDays} · Toplam mesai: ${totalMesaiSaat} sa`,
        `ZER YAPI: ${formatMoney(totalZerYapiHakedis, 0)} · Mevcut personel masrafı: ${formatMoney(totalMaasKazanci, 0)}`,
        `+${formatMoney(TABAN_FARK_TL, 0)} senaryo: ${formatMoney(analysisSummary.senaryoToplamMasraf, 0)} · Aylık şirket kârı: ${formatMoney(analysisSummary.aylikSirketKari, 0)}`,
        `Tasarruf — gün: ${formatMoney(analysisSummary.gunTasarrufu, 0)} · mesai (dahil ✓): ${formatMoney(analysisSummary.mesaiTasarrufu, 0)} · mesai payı %${analysisSummary.mesaiPayiPct.toFixed(1)}`,
      ];
      topLines.forEach((line) => {
        const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 6;
      });
      y += 4;

      // Role mix
      doc.setFont('helvetica', 'bold');
      doc.text('Rol Dağılım', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      const rm2 = analysisSummary.roleMix || { duzIsci: 0, usta: 0, formen: 0, senior: 0, diger: 0 };
      const roleLines = [`Düz işçi: ${rm2.duzIsci}`, `Usta: ${rm2.usta}`, `Formen: ${rm2.formen}`, `Senior: ${rm2.senior}`, `Diğer: ${rm2.diger}`];
      roleLines.forEach((l) => { doc.text(l, margin, y); y += 5; });
      y += 4;

      // Presentation / shareable summary
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      const pres = String(shareableSummary || analysisSummary.güçlüArgüman || '');
      const presWrapped = doc.splitTextToSize(pres, pageWidth - margin * 2);
      doc.text(presWrapped, margin, y);
      y += presWrapped.length * 5 + 6;

      // Personel detay başlığı
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Personel Detayı (Ad / Görev / Geldi / Mesai / ZER YAPI)', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      // List person details with pagination
      const pageHeight = doc.internal.pageSize.getHeight();
      activeStaffRows.forEach((row) => {
        const line = `${row.personel.ad} ${row.personel.soyad} / ${normalizeGorev(row.personel.gorev)} / ${row.geldiGun}g / ${row.mesaiSaat}sa / ${formatMoney(row.zerYapiHakedis, 0)}`;
        const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
        if (y + wrapped.length * 5 > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(wrapped, margin, y);
        y += wrapped.length * 5;
      });
      doc.save(`ZER_YAPI_Hakedis_${donemKey}.pdf`);
      showStatus('success', 'Rapor PDF olarak kaydedildi.');
    } catch (err: any) {
      showStatus('error', `PDF raporu indirilemedi: ${err?.message || err}`);
    } finally {
      setDownloadingReport(false);
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
      .corporate-report-logo-img { display: block !important; height: 75px !important; width: auto !important; max-width: 220px !important; }
      .corporate-report-watermark-img { display: block !important; }
      .rpt-foto-card img { display: block !important; }
      ${getCorporateReportCss()}
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
            onClick={handleCreateAnalysisReport}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow cursor-pointer flex items-center space-x-1"
            title="+6.000 TL taban senaryosu: gün + mesai tasarrufunu / aylık şirket kârını hesaplar."
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <BarChart3 size={12} />}
            <span>+6.000 Analiz (Gün+Mesai)</span>
          </button>
          <button
            type="button"
            onClick={() => void handleUstaUstasizRaporlar()}
            disabled={downloadingReport || activeStaffRows.length === 0}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl transition shadow cursor-pointer flex items-center space-x-1"
            title="3 HTML rapor: Ustasız hakediş (tahsilat), Ustalı liste, +6.000 kar analizi"
          >
            {downloadingReport ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
            <span>HTML Raporlar (Hakediş + Kar)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTopluAyYil(selectedYear);
              setShowTopluAyModal(true);
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow cursor-pointer flex items-center space-x-1"
            title="Birden fazla ay seçip ustasız ZER hakediş + saha kayıtları + ay/genel ödeme HTML raporu üretir"
          >
            <Layers size={12} />
            <span>Toplu Ay Raporla</span>
          </button>
          <button
            type="button"
            onClick={() => setShowUstaListeModal(true)}
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow cursor-pointer flex items-center space-x-1"
            title="Güncel dönem personelini ustalı / ustasız olarak göster"
          >
            <Users size={12} />
            <span>Ustalı / Ustasız Liste</span>
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
                Puantaj / Grup Yoklama’da «ZER YAPI» etiketi atanmış personeller. Hakedişten çıkarmak istediklerinizi işaretleyin.
              </p>
              <p className="text-[10px] text-amber-800 font-semibold mt-1.5">
                Aktif: Ustalı {ustaliRows.length} · Ustasız {ustasizRows.length}
              </p>
            </div>

            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {allStaffRows.length === 0 ? (
                <div className="text-center py-8 text-slate-400 italic text-[11px]">
                  «ZER YAPI» etiketi atanmış personel yok. Puantaj → Etiket Grupları’ndan kadroyu işaretleyip kaydedin.
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
                          {normalizeGorev(p.gorev)}
                          {isUstaGorev(p.gorev) ? ' · USTA' : ''} • {geldiGun} gün
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

            <div className="bg-emerald-50 border-2 border-emerald-400 p-4 rounded-xl space-y-3">
              <span className="text-[9px] text-emerald-900 font-black block uppercase tracking-wide">
                +{formatMoney(TABAN_FARK_TL, 0)} Taban — Fazla Maaş Ödemesi (Gün+Mesai)
              </span>
              <p className="text-[8px] text-emerald-800 font-semibold leading-relaxed">
                Taban {formatMoney(TABAN_FARK_TL, 0)} fazla olsaydı hem gün hem mesai ücreti artardı.
                Ödenecek fazla maaş:{' '}
                <span className="font-mono font-black">{formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}</span>
                {' '}(gün {formatMoney(analysisSummary.gunTasarrufu, 0)} + mesai {formatMoney(analysisSummary.mesaiTasarrufu, 0)}).
              </p>
              <div className="grid grid-cols-3 gap-2 text-[8px]">
                <div className="bg-white border border-slate-200 rounded-lg p-2 space-y-1">
                  <span className="font-black uppercase text-slate-600 block">Şuanki</span>
                  <div className="flex justify-between"><span>Gün</span><span className="font-mono">{formatMoney(totalGunKazanci, 0)}</span></div>
                  <div className="flex justify-between"><span>Mesai</span><span className="font-mono">{formatMoney(totalMesaiKazanci, 0)}</span></div>
                  <div className="flex justify-between font-black border-t pt-1"><span>Toplam</span><span className="font-mono">{formatMoney(totalMaasKazanci, 0)}</span></div>
                </div>
                <div className="bg-white border border-rose-200 rounded-lg p-2 space-y-1">
                  <span className="font-black uppercase text-rose-700 block">+{formatMoney(TABAN_FARK_TL, 0)}</span>
                  <div className="flex justify-between"><span>Gün</span><span className="font-mono">{formatMoney(analysisSummary.senaryoGunToplam, 0)}</span></div>
                  <div className="flex justify-between"><span>Mesai</span><span className="font-mono">{formatMoney(analysisSummary.senaryoMesaiToplam, 0)}</span></div>
                  <div className="flex justify-between font-black border-t pt-1"><span>Toplam</span><span className="font-mono">{formatMoney(analysisSummary.senaryoToplamMasraf, 0)}</span></div>
                </div>
                <div className="bg-emerald-100 border border-emerald-400 rounded-lg p-2 space-y-1">
                  <span className="font-black uppercase text-emerald-900 block">Fazla ödeme</span>
                  <div className="flex justify-between"><span>Gün</span><span className="font-mono">{formatMoney(analysisSummary.gunTasarrufu, 0)}</span></div>
                  <div className="flex justify-between"><span>Mesai ✓</span><span className="font-mono">{formatMoney(analysisSummary.mesaiTasarrufu, 0)}</span></div>
                  <div className="flex justify-between font-black border-t pt-1 text-emerald-950"><span>Toplam</span><span className="font-mono">{formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}</span></div>
                </div>
              </div>
              <div className="bg-white border border-emerald-300 rounded-lg p-2 text-[8px] space-y-1">
                <div className="flex justify-between font-bold">
                  <span>+6.000 farkı</span>
                  <span className="font-mono">{formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-rose-700">
                  <span>− ZER ödeneği ({totalPersonDays}×₺{ZER_YAPI_GUNLUK})</span>
                  <span className="font-mono">{formatMoney(analysisSummary.zerGeliri, 0)}</span>
                </div>
                <div className="flex justify-between font-black text-emerald-900 border-t border-emerald-100 pt-1">
                  <span>Net şirket karı</span>
                  <span className="font-mono">{formatMoney(analysisSummary.donemToplamFayda, 0)}</span>
                </div>
                <p className="text-[7px] text-emerald-700">Formül: +6.000 fark − ZER ödeneği = net kar</p>
              </div>
              <p className="text-[7px] text-emerald-700 font-mono">
                Mesai payı: %{analysisSummary.mesaiPayiPct.toFixed(1)} · Formül: mesai = (taban÷{analysisSummary.days}÷7,5)×1,5×saat
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-700 font-black block uppercase tracking-wide">Sunum Metni</span>
                <button onClick={handleCopySummary} className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1 text-[9px] font-bold text-slate-700 bg-white">
                  <Copy size={10} /> {copiedSummary ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>
              <div className="text-[8px] text-slate-600 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                {shareableSummary}
              </div>
            </div>

            {analysisSummary.enCokEtkilenen.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-2">
                <span className="text-[9px] text-amber-800 font-black block uppercase tracking-wide">En yüksek kâr katkısı (ilk 5)</span>
                {analysisSummary.enCokEtkilenen.map((p) => (
                  <div key={p.adSoyad} className="flex justify-between text-[8px] text-amber-800 gap-2">
                    <span className="truncate">{p.adSoyad}</span>
                    <span className="font-mono shrink-0">{formatMoney(p.masrafFarki, 0)}</span>
                  </div>
                ))}
              </div>
            )}
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
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handlePrint} className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1.5 shadow cursor-pointer">
                <Printer size={13} /><span>Yazdır / PDF (A3)</span>
              </button>
              <button onClick={handleDownloadHtml} className="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1.5 shadow cursor-pointer">
                <Download size={13} /><span>HTML İndir</span>
              </button>
              <button onClick={handleDownloadExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1.5 shadow cursor-pointer">
                <Download size={13} /><span>Excel İndir</span>
              </button>
              <button onClick={handleDownloadPdf} disabled={downloadingReport} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1.5 shadow cursor-pointer">
                <Download size={13} /><span>{downloadingReport ? 'PDF Oluşturuluyor...' : 'PDF İndir'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-3xl p-6 shadow-sm">
            <div id="kibar-report-print-area" className="report-root bg-white text-xs text-slate-800">
              <style>{REPORT_CSS}</style>
              <CorporateReportLayout orientation="landscape" docCode={`ZER-KAR-${donemKey}`}>
              <p className="rpt-antet-line">{CORPORATE_COMPANY.legalName}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">
                ZER YAPI · +{formatMoney(TABAN_FARK_TL, 0)} Taban Karşılaştırması · Günlük ₺{ZER_YAPI_GUNLUK} · {donemLabel}
              </p>
              <div className="rpt-header-title mb-4">
                Şuanki Masraf vs +{formatMoney(TABAN_FARK_TL, 0)} Taban — Fazla Maaş Ödemesi (Gün + Mesai)
              </div>

              <div className="rpt-zarar-box">
                <h4>Kontrol sonucu — +{formatMoney(TABAN_FARK_TL, 0)} olsaydı fazla maaş ödemesi</h4>
                <p className="rpt-zarar-msg">
                  Taban maaşlar {formatMoney(TABAN_FARK_TL, 0)} fazla olsaydı <strong>gün ve mesai birlikte artardı</strong>
                  (mesai = taban ÷ {analysisSummary.days} ÷ 7,5 × 1,5 × saat). Hesap <strong>kişi bazlıdır</strong>.
                  Bu senaryoda ödenecek <strong>fazla maaş</strong>:{' '}
                  <strong>{formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}</strong>
                  {' '}(gün {formatMoney(analysisSummary.gunTasarrufu, 0)} + mesai {formatMoney(analysisSummary.mesaiTasarrufu, 0)},
                  mesai payı %{analysisSummary.mesaiPayiPct.toFixed(1)}).
                  Bu tutar, tabanı düşük tutarak kaçınılan ekstra maaş ödemesidir (= şirket kârı / tasarruf).
                </p>
                <p className="rpt-math-formula">
                  Gün = (taban ÷ {analysisSummary.days}) × geldi · Mesai = (taban ÷ {analysisSummary.days} ÷ 7,5) × 1,5 × saat
                  · Senaryo tabanı = mevcut + {formatMoney(TABAN_FARK_TL, 0)}
                  · ZER ödeneği = geldi × ₺{ZER_YAPI_GUNLUK}
                </p>
                <div className="rpt-math-grid">
                  <div className="rpt-math-col rpt-math-col--now">
                    <h5>1 · Şuanki hali</h5>
                    <div className="rpt-math-row"><span>Ort. taban</span><span>{formatMoney(analysisSummary.ortalamaMevcutTaban, 0)}</span></div>
                    <div className="rpt-math-row"><span>Gün kazancı</span><span>{formatMoney(totalGunKazanci, 0)}</span></div>
                    <div className="rpt-math-row"><span>Mesai kazancı</span><span>{formatMoney(totalMesaiKazanci, 0)}</span></div>
                    <div className="rpt-math-row"><span>Toplam masraf</span><span>{formatMoney(totalMaasKazanci, 0)}</span></div>
                  </div>
                  <div className="rpt-math-col rpt-math-col--plus">
                    <h5>2 · +{formatMoney(TABAN_FARK_TL, 0)} hali</h5>
                    <div className="rpt-math-row"><span>Ort. taban</span><span>{formatMoney(analysisSummary.ortalamaSenaryoTaban, 0)}</span></div>
                    <div className="rpt-math-row"><span>Gün kazancı</span><span>{formatMoney(analysisSummary.senaryoGunToplam, 0)}</span></div>
                    <div className="rpt-math-row"><span>Mesai kazancı</span><span>{formatMoney(analysisSummary.senaryoMesaiToplam, 0)}</span></div>
                    <div className="rpt-math-row"><span>Toplam masraf</span><span>{formatMoney(analysisSummary.senaryoToplamMasraf, 0)}</span></div>
                  </div>
                  <div className="rpt-math-col rpt-math-col--delta">
                    <h5>3 · Fazla maaş ödemesi</h5>
                    <div className="rpt-math-row"><span>Taban farkı</span><span>+{formatMoney(TABAN_FARK_TL, 0)}/kişi</span></div>
                    <div className="rpt-math-row"><span>Gün farkı</span><span>{formatMoney(analysisSummary.gunTasarrufu, 0)}</span></div>
                    <div className="rpt-math-row"><span>Mesai farkı ✓</span><span>{formatMoney(analysisSummary.mesaiTasarrufu, 0)}</span></div>
                    <div className="rpt-math-row"><span>Toplam fazla</span><span>{formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}</span></div>
                  </div>
                </div>
                <div className="rpt-zarar-hero">{formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}</div>
                <p className="rpt-zer-meta">
                  {activeStaffRows.length} personel · {totalPersonDays} iş-günü · {totalMesaiSaat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa mesai
                  · kişi başı ortalama fazla ödeme {formatMoney(analysisSummary.ortalamaKisiMasrafArtisi, 0)}
                  · kişi bazlı maaş + mesai dahil ✓
                </p>
                <p className="rpt-zer-meta" style={{ marginTop: 8 }}>
                  ZER YAPI ödeneği (₺{ZER_YAPI_GUNLUK}/gün): <strong>{formatMoney(analysisSummary.zerGeliri, 0)}</strong>
                  {' '}· Net şirket karı (+6.000 fark − ZER):{' '}
                  <strong>{formatMoney(analysisSummary.donemToplamFayda, 0)}</strong>
                </p>
              </div>

              {/* —— ZER YAPI Hakediş Özeti —— */}
              <div className="rpt-zer-box">
                <h4>ZER YAPI Ödeneği (₺{ZER_YAPI_GUNLUK}/gün · aylık ~₺{ZER_YAPI_GUNLUK * 30})</h4>
                <p className="rpt-zer-formula">
                  Formül: Toplam çalışma günü × ₺{ZER_YAPI_GUNLUK}
                  &nbsp;|&nbsp; {totalPersonDays} gün × ₺{ZER_YAPI_GUNLUK} = {formatMoney(totalZerYapiHakedis, 0)}
                </p>
                <div className="rpt-zer-total">{formatMoney(totalZerYapiHakedis, 0)}</div>
                <p className="rpt-zer-meta">
                  Şirket öder — kardan düşülür. Net kar = +{formatMoney(TABAN_FARK_TL, 0)} fark − ZER = {formatMoney(analysisSummary.donemToplamFayda, 0)}.
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
                          <td className="rpt-td-num rpt-mono rpt-mono-nowrap">{formatMoney(resolveMaasTabani(row.personel), 0)}</td>
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
                <p className="rpt-sec-sub">
                  {sahaFaaliyetSatirlari.length} kayıt · Formen + Tesisatçı + Mermerci · eskiden yeniye
                </p>
                {sahaFaaliyetSatirlari.length === 0 ? (
                  <p className="text-[9px] text-slate-400 italic">Bu dönemde saha faaliyeti kaydı yok.</p>
                ) : (
                  <div className="rpt-table-wrap">
                    <table className="rpt-act-table">
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '53%' }} />
                        <col style={{ width: '10%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="rpt-align-c rpt-act-no">No</th>
                          <th className="rpt-align-l rpt-act-date">Tarih</th>
                          <th className="rpt-align-l">Kaynak</th>
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
                            <td className="rpt-align-l text-[8px] font-bold uppercase text-slate-600">
                              {sf.kaynakEkran === 'TESISATCI_MOBIL'
                                ? 'Tesisatçı'
                                : sf.kaynakEkran === 'MERMERCI_MOBIL'
                                  ? 'Mermerci'
                                  : sf.kaynakEkran === 'FORMEN_MOBIL'
                                    ? 'Formen'
                                    : 'Saha'}
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
                <p className="rpt-sec-sub">
                  {kampFaaliyetSatirlari.length} kayıt
                  {kampKolajFotolari.length > 0 ? ` · ${kampKolajFotolari.length} fotoğraf kolajda` : ''}
                </p>
                {kampFaaliyetSatirlari.length === 0 ? (
                  <p className="text-[9px] text-slate-400 italic">Bu dönemde kamp faaliyeti kaydı yok.</p>
                ) : (
                  <div className="rpt-table-wrap">
                    <table className="rpt-act-table">
                      <colgroup>
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '63%' }} />
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
                {kampKolajFotolari.length > 0 && (
                  <div className="mt-3">
                    <p className="rpt-foto-grup">Kamp faaliyet foto kolajı ({kampKolajFotolari.length})</p>
                    <div className="rpt-foto-grid">
                      {kampKolajFotolari.slice(0, 48).map((f) => (
                        <div key={f.id} className="rpt-foto-card">
                          <img src={f.imageUrl} alt={f.baslik || 'Kamp foto'} />
                          <div className="rpt-foto-cap">
                            {(f.baslik || f.aciklama || 'Kamp').slice(0, 48)}
                          </div>
                        </div>
                      ))}
                    </div>
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
                <div className="rpt-summary-card rpt-summary-hakedis">
                  <span>Fazla maaş ödemesi (+{formatMoney(TABAN_FARK_TL, 0)} · gün+mesai)</span>
                  <span className="rpt-summary-val">{formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}</span>
                  <span className="rpt-summary-sub">
                    Gün {formatMoney(analysisSummary.gunTasarrufu, 0)} + Mesai {formatMoney(analysisSummary.mesaiTasarrufu, 0)}
                    {' '}· mesai payı %{analysisSummary.mesaiPayiPct.toFixed(1)}
                  </span>
                </div>
                <div className="rpt-summary-card">
                  <span>ZER YAPI ödeneği (₺{ZER_YAPI_GUNLUK}/gün)</span>
                  <span className="rpt-summary-val">{formatMoney(totalZerYapiHakedis, 0)}</span>
                  <span className="rpt-summary-sub">{totalPersonDays} gün × ₺{ZER_YAPI_GUNLUK} · kardan düşülür</span>
                </div>
                <div className="rpt-summary-card rpt-summary-hakedis">
                  <span>Net şirket karı</span>
                  <span className="rpt-summary-val">{formatMoney(analysisSummary.donemToplamFayda, 0)}</span>
                  <span className="rpt-summary-sub">
                    {formatMoney(analysisSummary.fazlaMaasOdemesi, 0)} − ZER {formatMoney(analysisSummary.zerGeliri, 0)}
                  </span>
                </div>
              </div>

              <div className="rpt-compare-grid">
                <div className="rpt-compare-card">
                  <strong>Yan yana özet</strong>
                  <div style={{ marginTop: 6, fontSize: '7.5pt', color: '#4b5563' }}>
                    Şuanki {formatMoney(totalMaasKazanci, 0)} · +{formatMoney(TABAN_FARK_TL, 0)} {formatMoney(analysisSummary.senaryoToplamMasraf, 0)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '9pt', color: '#047857', fontWeight: 900 }}>
                    +6.000 farkı: {formatMoney(analysisSummary.fazlaMaasOdemesi, 0)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '7pt', color: '#047857' }}>
                    Kişi bazlı ✓ · Mesai dahil ✓ · Mesai farkı {formatMoney(analysisSummary.mesaiTasarrufu, 0)}
                  </div>
                </div>
                <div className="rpt-compare-card">
                  <strong>Net şirket karı</strong>
                  <div style={{ marginTop: 6, fontSize: '9pt', color: '#b91c1c', fontWeight: 900 }}>
                    − ZER {formatMoney(totalZerYapiHakedis, 0)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '7.5pt', color: '#4b5563' }}>
                    {totalPersonDays} gün × ₺{ZER_YAPI_GUNLUK}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '9pt', color: '#047857', fontWeight: 900 }}>
                    Net kar {formatMoney(analysisSummary.donemToplamFayda, 0)}
                  </div>
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

      {showUstaListeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Ustalı / Ustasız Personel — {donemLabel}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Aktif hakediş listesi (çıkarılanlar hariç) · Ustalı {ustaliRows.length} · Ustasız{' '}
                  {ustasizRows.length} · HTML: ustasız hakediş + ustalı + kar analizi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUstaListeModal(false)}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100 overflow-y-auto flex-1">
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase text-amber-800 tracking-wider">
                    Ustalı ({ustaliRows.length})
                  </h4>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">
                    ZER {formatMoney(summarizeRows(ustaliRows).zer, 0)}
                  </span>
                </div>
                {ustaliRows.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Usta görevli personel yok.</p>
                ) : (
                  ustaliRows.map((r) => (
                    <div
                      key={r.personel.id}
                      className="flex justify-between gap-2 p-2 rounded-xl bg-amber-50/80 border border-amber-100"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {r.personel.ad} {r.personel.soyad}
                        </p>
                        <p className="text-[9px] text-slate-500 uppercase font-semibold">
                          {normalizeGorev(r.personel.gorev)} · {r.geldiGun} gün
                          {r.mesaiSaat > 0 ? ` · ${r.mesaiSaat} sa` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 whitespace-nowrap">
                        {formatMoney(r.zerYapiHakedis, 0)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase text-slate-700 tracking-wider">
                    Ustasız Hakediş ({ustasizRows.length})
                  </h4>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">
                    ZER {formatMoney(summarizeRows(ustasizRows).zer, 0)}
                  </span>
                </div>
                {ustasizRows.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Ustasız personel yok.</p>
                ) : (
                  ustasizRows.map((r) => (
                    <div
                      key={r.personel.id}
                      className="flex justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {r.personel.ad} {r.personel.soyad}
                        </p>
                        <p className="text-[9px] text-slate-500 uppercase font-semibold">
                          {normalizeGorev(r.personel.gorev)} · {r.geldiGun} gün
                          {r.mesaiSaat > 0 ? ` · ${r.mesaiSaat} sa` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 whitespace-nowrap">
                        {formatMoney(r.zerYapiHakedis, 0)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => void handleUstaUstasizRaporlar()}
                disabled={downloadingReport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-amber-500 text-slate-950 cursor-pointer disabled:opacity-60"
                title="Ustasız hakediş + Ustalı + +6.000 kar analizi (HTML)"
              >
                <FileText size={12} /> 3 HTML Rapor Üret
              </button>
              <button
                type="button"
                onClick={() => setShowUstaListeModal(false)}
                className="px-4 py-2 rounded-xl text-[11px] font-bold bg-slate-900 text-white cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {showTopluAyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <Layers size={16} className="text-teal-600" /> Toplu Ay Raporla
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Seçilen ayların ustasız ZER hakedişi + saha kayıtları + ay / genel ödeme (HTML)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTopluAyModal(false)}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label className="block space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-500">Yıl</span>
                <select
                  value={topluAyYil}
                  onChange={(e) => setTopluAyYil(Number(e.target.value))}
                  className="w-full text-xs font-bold p-2.5 border border-slate-200 rounded-xl"
                >
                  {[2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase text-slate-500">Aylar</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTopluAySecimler([2, 3, 4, 5, 6, 7])}
                      className="text-[10px] font-bold text-teal-700 hover:underline cursor-pointer"
                    >
                      Şub–Tem
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopluAySecimler([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])}
                      className="text-[10px] font-bold text-slate-600 hover:underline cursor-pointer"
                    >
                      Tümü
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopluAySecimler([])}
                      className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {TURKISH_MONTHS.map((m, i) => {
                    const ay = i + 1;
                    const on = topluAySecimler.includes(ay);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleTopluAy(ay)}
                        className={`px-2 py-2 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                          on
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-[11px] text-teal-900 leading-relaxed">
                Seçili: <strong>{topluAySecimler.map((a) => TURKISH_MONTHS[a - 1]).join(', ') || '—'}</strong>
                {' · '}
                {topluAyYil}
                <br />
                Raporda her ay için ustasız personel listesi, saha kayıtları ve ay ödemesi; sonda genel toplam
                tahsilat yer alır.
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowTopluAyModal(false)}
                className="px-4 py-2 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-700 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleTopluAyUstasizRapor}
                disabled={topluAyBusy || topluAySecimler.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-teal-600 text-white cursor-pointer disabled:opacity-60"
              >
                {topluAyBusy ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
                Ustasız Toplu Hakediş Üret
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
