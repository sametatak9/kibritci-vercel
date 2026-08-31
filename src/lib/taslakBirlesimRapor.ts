/**
 * Taslak birleşim paketleri — seçim, sıfırlama, antetli HTML/Excel rapor.
 */
import type { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { formatDateLabelTr } from './dateKeyUtils';
import {
  findFaturalarForIrsaliye,
  irsaliyeHizmetMiktari,
  isTaslakMaliBagFatura,
} from './evrakDonusum';
import {
  irsaliyeNoChainSortKey,
  malzemeTipiLabel,
  micirMalzemeTipiSortKey,
  resolveMicirMalzemeTipiFromIrsaliye,
} from './micirUtils';
import { wrapCorporateReportHtml } from './corporateReportHtml';
import { getReportEmailToolbarHtml, openHtmlReportWindow } from './reportEmail';

export type TaslakBirlesimPaketi = {
  fatura: Fatura;
  irsaliyeler: Irsaliye[];
  toplamTon: number;
  saIds: string[];
  saOzet: string;
  malzemeOzet: string;
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortIrs(irs: Irsaliye[]): Irsaliye[] {
  return [...irs].sort((a, b) => {
    const aTip = resolveMicirMalzemeTipiFromIrsaliye(a);
    const bTip = resolveMicirMalzemeTipiFromIrsaliye(b);
    if (aTip || bTip) {
      const ak = aTip != null ? micirMalzemeTipiSortKey(aTip) : 99;
      const bk = bTip != null ? micirMalzemeTipiSortKey(bTip) : 99;
      if (ak !== bk) return ak - bk;
    }
    const d = String(a.tarih || '').localeCompare(String(b.tarih || ''));
    if (d !== 0) return d;
    return irsaliyeNoChainSortKey(a.irsaliyeNo) - irsaliyeNoChainSortKey(b.irsaliyeNo);
  });
}

/** Cariye ait taslak/gerçek birleşim paketlerini kur */
export function buildTaslakBirlesimPaketleri(input: {
  faturalar: Fatura[];
  irsaliyeler: Irsaliye[];
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  cariKartId?: string;
  onlyTaslak?: boolean;
}): TaslakBirlesimPaketi[] {
  const { faturalar, irsaliyeler, satinAlmaTalepleri = [], cariKartId, onlyTaslak } = input;
  const list = (faturalar || []).filter((ft) => {
    if (cariKartId && ft.cariKartId && ft.cariKartId !== cariKartId) return false;
    if (onlyTaslak && !isTaslakMaliBagFatura(ft)) return false;
    const bagli = ft.bagliIrsaliyeler || [];
    if (ft.donusumKaynagi === 'IR_FATURA') return true;
    if (bagli.length > 0) return true;
    return isTaslakMaliBagFatura(ft);
  });

  return list
    .map((ft) => {
      const refs = new Set((ft.bagliIrsaliyeler || []).map(String));
      const linked = sortIrs(
        (irsaliyeler || []).filter(
          (ir) =>
            refs.has(ir.id) ||
            refs.has(ir.irsaliyeNo) ||
            (ir.faturaNo && ir.faturaNo === ft.faturaNo)
        )
      );
      const toplamTon = linked.reduce((s, ir) => s + irsaliyeHizmetMiktari(ir).miktar, 0);
      const saIds = [
        ...new Set([ft.saId, ...linked.map((ir) => ir.saId)].filter(Boolean).map(String)),
      ];
      const saOzet = saIds
        .map((sid) => {
          const sa = satinAlmaTalepleri.find((s) => s.saId === sid);
          return sa
            ? `${sid} (${sa.cariFirma || '—'} · ${(sa.kalemler || []).length} kalem)`
            : sid;
        })
        .join(' · ');
      const tipMap = new Map<string, number>();
      for (const ir of linked) {
        const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
        const label = tip ? malzemeTipiLabel(tip) : 'Diğer';
        tipMap.set(label, (tipMap.get(label) || 0) + irsaliyeHizmetMiktari(ir).miktar);
      }
      const malzemeOzet = [...tipMap.entries()]
        .map(([k, v]) => `${k} ${v.toLocaleString('tr-TR')} ton`)
        .join(' · ');
      return {
        fatura: ft,
        irsaliyeler: linked,
        toplamTon,
        saIds,
        saOzet: saOzet || '—',
        malzemeOzet: malzemeOzet || '—',
      };
    })
    .filter((p) => p.irsaliyeler.length > 0 || isTaslakMaliBagFatura(p.fatura))
    .sort((a, b) => String(b.fatura.tarih || '').localeCompare(String(a.fatura.tarih || '')));
}

export function paketlerForSelectedIrsaliyeler(
  paketler: TaslakBirlesimPaketi[],
  selectedIds: Set<string>
): TaslakBirlesimPaketi[] {
  if (!selectedIds.size) return [];
  return paketler.filter((p) => p.irsaliyeler.some((ir) => selectedIds.has(ir.id)));
}

function irMatchesSelected(ir: Irsaliye, selected: Set<string>): boolean {
  return (
    selected.has(String(ir.id || '')) ||
    selected.has(String(ir.irsaliyeId || '')) ||
    selected.has(String(ir.irsaliyeNo || ''))
  );
}

function irMatchesFatura(ir: Irsaliye, ft: Fatura): boolean {
  const refs = new Set((ft.bagliIrsaliyeler || []).map((x) => String(x).trim()));
  const fatNo = String(ft.faturaNo || '').trim();
  if (refs.has(String(ir.id || '')) || refs.has(String(ir.irsaliyeNo || '')) || refs.has(String(ir.irsaliyeId || ''))) {
    return true;
  }
  return Boolean(fatNo && String(ir.faturaNo || '').trim() === fatNo);
}

/** Seçili irsaliyelerin birleşim faturalarını sıfırlama planı */
export function planSelectedBirlesimReset(input: {
  selectedIrsaliyeIds: string[];
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  /** Liste başlığındaki FAT-… — bellek eşleşmesi kaçsa bile paketi bulur */
  faturaNoHint?: string;
}): {
  linkedIrsaliyeler: Irsaliye[];
  faturalarToDelete: Fatura[];
  faturalarToUnlink: Fatura[];
  extraIrsaliyeIds: string[];
  ozet: string;
} {
  const selected = new Set((input.selectedIrsaliyeIds || []).map(String).filter(Boolean));
  const hint = String(input.faturaNoHint || '').trim();
  const linkedFromSelection = (input.irsaliyeler || []).filter((ir) => irMatchesSelected(ir, selected));
  const faturaMap = new Map<string, Fatura>();
  for (const ir of linkedFromSelection) {
    for (const ft of findFaturalarForIrsaliye(ir, input.faturalar || [])) {
      faturaMap.set(ft.id, ft);
    }
  }
  if (hint) {
    for (const ft of input.faturalar || []) {
      if (String(ft.faturaNo || '').trim() === hint || String(ft.id || '') === hint) {
        faturaMap.set(ft.id, ft);
      }
    }
    for (const ir of input.irsaliyeler || []) {
      if (String(ir.faturaNo || '').trim() === hint) {
        for (const ft of findFaturalarForIrsaliye(ir, input.faturalar || [])) {
          faturaMap.set(ft.id, ft);
        }
      }
    }
  }
  const allLinked: Irsaliye[] = [];
  const seen = new Set<string>();
  const addIr = (ir: Irsaliye) => {
    if (!ir?.id || seen.has(ir.id)) return;
    seen.add(ir.id);
    allLinked.push(ir);
  };
  for (const ir of linkedFromSelection) addIr(ir);
  if (hint) {
    for (const ir of input.irsaliyeler || []) {
      if (String(ir.faturaNo || '').trim() === hint) addIr(ir);
    }
  }
  for (const ft of faturaMap.values()) {
    for (const ir of input.irsaliyeler || []) {
      if (irMatchesFatura(ir, ft)) addIr(ir);
    }
  }
  const extraIrsaliyeIds = [...selected].filter((id) => !seen.has(id));
  const faturalarToDelete: Fatura[] = [];
  const faturalarToUnlink: Fatura[] = [];
  for (const ft of faturaMap.values()) {
    if (isTaslakMaliBagFatura(ft)) faturalarToDelete.push(ft);
    else faturalarToUnlink.push(ft);
  }
  const ozet = [
    `Seçim: ${selected.size} kayıt`,
    `Paket irsaliye: ${allLinked.length}`,
    `Silinecek taslak: ${faturalarToDelete.length}`,
    faturalarToUnlink.length ? `Gerçek faturadan koparılacak: ${faturalarToUnlink.length}` : '',
    [...faturalarToDelete, ...faturalarToUnlink].map((f) => f.faturaNo).filter(Boolean).join(', ') ||
      hint ||
      '—',
  ]
    .filter(Boolean)
    .join(' · ');
  return { linkedIrsaliyeler: allLinked, faturalarToDelete, faturalarToUnlink, extraIrsaliyeIds, ozet };
}

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildTaslakBirlesimHtmlRapor(paketler: TaslakBirlesimPaketi[]): string {
  const toplamIr = paketler.reduce((s, p) => s + p.irsaliyeler.length, 0);
  const toplamTon = paketler.reduce((s, p) => s + p.toplamTon, 0);
  const body = `
    ${getReportEmailToolbarHtml({
      subject: 'Kibritçi — Taslak Birleşim Raporu',
      fileName: 'Kibritci_Taslak_Birlesim.html',
    })}
    <div class="mb-6">
      <h1 class="text-xl font-extrabold text-slate-900">Taslak Birleşim Raporu</h1>
      <p class="text-xs text-slate-500 mt-1">
        ${paketler.length} paket · ${toplamIr} irsaliye · Toplam ağırlık ${toplamTon.toLocaleString('tr-TR')} ton
      </p>
      <p class="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 font-semibold">
        Bu kayıtlar taslak mali bağdır (matrah ₺0). Gerçek fatura girişi ayrıca yapılır.
      </p>
    </div>
    ${paketler
      .map((p, idx) => {
        const ft = p.fatura;
        return `
      <section class="mb-8 border border-violet-200 rounded-xl overflow-hidden">
        <div class="bg-violet-50 px-4 py-3 flex flex-wrap gap-3 text-xs items-center">
          <span class="font-black text-violet-900">Paket ${idx + 1}</span>
          <strong>${esc(ft.faturaNo)}</strong>
          <span>${esc(formatDateLabelTr(ft.tarih))}</span>
          <span class="font-black bg-white border border-violet-200 px-1.5 py-0.5 rounded">${p.irsaliyeler.length} irsaliye</span>
          <span class="font-black bg-indigo-50 border border-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded">${p.toplamTon.toLocaleString('tr-TR')} ton</span>
        </div>
        <div class="px-4 py-2 text-[11px] text-slate-700 border-t border-violet-100 space-y-1">
          <div><span class="text-slate-500">Firma:</span> <strong>${esc(ft.cariUnvan || '—')}</strong></div>
          <div><span class="text-slate-500">Satın alma bağı:</span> <strong>${esc(p.saOzet)}</strong></div>
          <div><span class="text-slate-500">Malzeme:</span> <strong>${esc(p.malzemeOzet)}</strong></div>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-slate-50 text-left text-slate-600 border-t border-slate-100">
              <th class="px-3 py-2">#</th>
              <th class="px-3 py-2">Tarih</th>
              <th class="px-3 py-2">İrsaliye</th>
              <th class="px-3 py-2">Malzeme</th>
              <th class="px-3 py-2 text-right">Ağırlık</th>
              <th class="px-3 py-2">Plaka</th>
              <th class="px-3 py-2">SA</th>
            </tr>
          </thead>
          <tbody>
            ${p.irsaliyeler
              .map((ir, i) => {
                const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
                const h = irsaliyeHizmetMiktari(ir);
                return `<tr class="border-t border-slate-100">
                  <td class="px-3 py-1.5">${i + 1}</td>
                  <td class="px-3 py-1.5">${esc(formatDateLabelTr(ir.tarih))}</td>
                  <td class="px-3 py-1.5 font-semibold">${esc(ir.irsaliyeNo)}</td>
                  <td class="px-3 py-1.5">${esc(tip ? malzemeTipiLabel(tip) : '—')}</td>
                  <td class="px-3 py-1.5 text-right font-mono">${h.miktar.toLocaleString('tr-TR')} ${esc(h.etiket)}</td>
                  <td class="px-3 py-1.5 font-mono">${esc(ir.plaka || '—')}</td>
                  <td class="px-3 py-1.5">${esc(ir.saId || '—')}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </section>`;
      })
      .join('')}
  `;
  return wrapCorporateReportHtml(body, {
    title: 'Taslak Birleşim Raporu',
    docCode: 'TASLAK-BIRLESIM',
    orientation: 'portrait',
    autoPrint: false,
  });
}

export function openTaslakBirlesimHtmlRapor(paketler: TaslakBirlesimPaketi[]): Window | null {
  if (!paketler.length) {
    alert('Rapor için birleşim paketi yok.');
    return null;
  }
  return openHtmlReportWindow(buildTaslakBirlesimHtmlRapor(paketler), 'Taslak Birleşim Raporu');
}

export async function exportTaslakBirlesimExcel(paketler: TaslakBirlesimPaketi[]): Promise<{
  paket: number;
  irsaliye: number;
  toplamTon: number;
  fileName: string;
}> {
  if (!paketler.length) throw new Error('Excel için birleşim paketi yok.');
  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  const ws = wb.addWorksheet('Taslak Birleşim');
  ws.columns = [
    { width: 6 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 28 },
    { width: 36 },
  ];

  ws.getRow(1).height = 56;
  ws.mergeCells(1, 1, 2, 3);
  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 160, height: 60 } });
  } else {
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  }
  ws.mergeCells(1, 4, 1, 10);
  ws.getCell(1, 4).value = 'Taslak Birleşim Raporu';
  ws.getCell(1, 4).font = { bold: true, size: 14 };
  ws.getCell(1, 4).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.mergeCells(2, 4, 2, 10);
  const toplamIr = paketler.reduce((s, p) => s + p.irsaliyeler.length, 0);
  const toplamTon = paketler.reduce((s, p) => s + p.toplamTon, 0);
  ws.getCell(2, 4).value = `${paketler.length} paket · ${toplamIr} irsaliye · ${toplamTon.toLocaleString('tr-TR')} ton · ${new Date().toLocaleString('tr-TR')}`;
  ws.getCell(2, 4).font = { size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(2, 4).alignment = { horizontal: 'right' };
  ws.mergeCells(3, 1, 3, 10);
  ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.getRow(3).height = 4;
  ws.mergeCells(4, 1, 4, 10);
  ws.getCell(4, 1).value = KIBRITCI_COMPANY.legalName;
  ws.getCell(4, 1).font = { bold: true, size: 8 };
  ws.mergeCells(5, 1, 5, 10);
  ws.getCell(5, 1).value = `${KIBRITCI_COMPANY.address} · ${KIBRITCI_COMPANY.phone}`;
  ws.getCell(5, 1).font = { size: 7, color: { argb: 'FF64748B' } };

  let row = 7;
  const headers = [
    '#',
    'Birleşim No',
    'Tarih',
    'İrsaliye',
    'Malzeme',
    'Ağırlık',
    'Plaka',
    'SA No',
    'SA özeti',
    'Firma',
  ];
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  });
  row += 1;

  let n = 0;
  for (const p of paketler) {
    for (const ir of p.irsaliyeler) {
      n += 1;
      const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
      const h = irsaliyeHizmetMiktari(ir);
      const vals: Array<string | number> = [
        n,
        p.fatura.faturaNo || '',
        formatDateLabelTr(ir.tarih),
        ir.irsaliyeNo || '',
        tip ? malzemeTipiLabel(tip) : '',
        h.miktar || 0,
        ir.plaka || '',
        ir.saId || p.fatura.saId || '',
        p.saOzet,
        p.fatura.cariUnvan || ir.firma || '',
      ];
      vals.forEach((v, i) => {
        const c = ws.getCell(row, i + 1);
        c.value = v;
        c.font = { size: 9 };
        if (i === 5 && typeof v === 'number') c.numFmt = '#,##0.00';
      });
      row += 1;
    }
    row += 1;
    ws.mergeCells(row, 1, row, 4);
    ws.getCell(row, 1).value = `Paket toplamı ${p.fatura.faturaNo}`;
    ws.getCell(row, 1).font = { bold: true, size: 9 };
    ws.getCell(row, 5).value = p.malzemeOzet;
    ws.getCell(row, 6).value = p.toplamTon;
    ws.getCell(row, 6).numFmt = '#,##0.00';
    ws.getCell(row, 6).font = { bold: true };
    ws.getCell(row, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    row += 2;
  }

  row += 1;
  ws.mergeCells(row, 1, row, 10);
  ws.getCell(row, 1).value = `GENEL TOPLAM AĞIRLIK: ${toplamTon.toLocaleString('tr-TR')} ton · ${toplamIr} irsaliye · ${paketler.length} paket`;
  ws.getCell(row, 1).font = { bold: true, size: 11 };
  ws.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

  const fileName = `Kibritci_Taslak_Birlesim_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, fileName);
  return { paket: paketler.length, irsaliye: toplamIr, toplamTon, fileName };
}
