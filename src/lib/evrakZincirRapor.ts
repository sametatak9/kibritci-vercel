import type { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';
import { getReportEmailToolbarHtml, openHtmlReportWindow } from './reportEmail';
import {
  describeEvrakZinciri,
  findFaturalarForIrsaliye,
  findIrsaliyelerForSa,
} from './evrakDonusum';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number): string {
  return `₺${Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
}

export type EvrakZincirRaporInput = {
  sa?: SatinAlmaTalebi | null;
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  /** SA yoksa / kısmi seçimde odak irsaliyeler */
  focusIrsaliyeIds?: string[];
};

function resolveChain(input: EvrakZincirRaporInput): {
  sa?: SatinAlmaTalebi;
  irs: Irsaliye[];
  fts: Fatura[];
} {
  const { sa, irsaliyeler, faturalar, focusIrsaliyeIds } = input;
  let irs: Irsaliye[] = [];
  if (sa) {
    irs = findIrsaliyelerForSa(sa, irsaliyeler);
  }
  if (focusIrsaliyeIds?.length) {
    const focus = new Set(focusIrsaliyeIds);
    const focused = irsaliyeler.filter((ir) => focus.has(ir.id) || focus.has(ir.irsaliyeNo));
    if (focused.length) {
      const byId = new Map(irs.map((ir) => [ir.id, ir]));
      for (const ir of focused) byId.set(ir.id, ir);
      irs = [...byId.values()];
    }
  }
  if (!irs.length && focusIrsaliyeIds?.length) {
    const focus = new Set(focusIrsaliyeIds);
    irs = irsaliyeler.filter((ir) => focus.has(ir.id) || focus.has(ir.irsaliyeNo));
  }

  const ftMap = new Map<string, Fatura>();
  for (const ir of irs) {
    for (const ft of findFaturalarForIrsaliye(ir, faturalar)) {
      ftMap.set(ft.id, ft);
    }
  }
  if (sa?.saId) {
    for (const ft of faturalar) {
      if (ft.saId === sa.saId) ftMap.set(ft.id, ft);
    }
  }
  return { sa: sa || undefined, irs, fts: [...ftMap.values()] };
}

export function buildEvrakZincirRaporHtml(input: EvrakZincirRaporInput): string {
  const { sa, irs, fts } = resolveChain(input);
  const z = describeEvrakZinciri(sa, input.irsaliyeler, input.faturalar);
  const title = sa
    ? `Evrak Zinciri — ${sa.saId}`
    : `Evrak Zinciri — ${irs.length} irsaliye`;

  const saBlock = sa
    ? `
    <section class="mb-8">
      <h2 class="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">1 · İlk hali — Satın Alma</h2>
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <div class="bg-slate-50 px-4 py-3 flex flex-wrap gap-4 text-xs">
          <div><span class="text-slate-500">SA No:</span> <strong>${esc(sa.saId)}</strong></div>
          <div><span class="text-slate-500">Tarih:</span> <strong>${esc(sa.tarih)}</strong></div>
          <div><span class="text-slate-500">Firma:</span> <strong>${esc(sa.cariFirma)}</strong></div>
          <div><span class="text-slate-500">Onay:</span> <strong>${esc(sa.onayDurumu)}</strong></div>
        </div>
        <p class="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
          Bu belge düzenlenebilir kalır; bağlama kaydı kilitlemez.
        </p>
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-white border-t border-slate-100 text-left text-slate-600">
              <th class="px-3 py-2">Ürün</th>
              <th class="px-3 py-2 text-right">Miktar</th>
              <th class="px-3 py-2">Birim</th>
            </tr>
          </thead>
          <tbody>
            ${(sa.kalemler || [])
              .map(
                (k) => `
              <tr class="border-t border-slate-50">
                <td class="px-3 py-2 font-semibold">${esc(k.urunAdi)}</td>
                <td class="px-3 py-2 text-right font-mono">${esc(k.miktar)}</td>
                <td class="px-3 py-2">${esc(k.birim || 'ADET')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`
    : `
    <section class="mb-8">
      <h2 class="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">1 · İlk hali — Satın Alma</h2>
      <p class="text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl p-4">
        Bu seçimde bağlı satın alma kaydı yok (veya henüz eşleşmedi). İrsaliye / fatura bağları aşağıda.
      </p>
    </section>`;

  const irBlock = `
    <section class="mb-8">
      <h2 class="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">
        2 · Bağlı sevk — İrsaliyeler (${irs.length})
      </h2>
      ${
        irs.length === 0
          ? `<p class="text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl p-4">İrsaliye yok.</p>`
          : `<div class="space-y-3">
        ${irs
          .map((ir) => {
            const kalemOzet = (ir.kalemler || [])
              .map((k) => `${esc(k.urunAdi)}: ${esc(k.miktar)} ${esc(k.birim || '')}`)
              .join(' · ');
            return `
          <div class="border border-amber-100 bg-amber-50/40 rounded-xl p-4 text-xs">
            <div class="flex flex-wrap gap-3 font-semibold text-slate-900">
              <span>${esc(ir.irsaliyeNo)}</span>
              <span class="text-slate-500 font-normal">${esc(ir.tarih)}</span>
              ${ir.plaka ? `<span class="font-mono text-slate-600">${esc(ir.plaka)}</span>` : ''}
              ${ir.kaynak ? `<span class="text-[9px] uppercase font-black bg-white border border-amber-200 px-1.5 py-0.5 rounded">${esc(ir.kaynak)}</span>` : ''}
              ${ir.faturaNo ? `<span class="text-[9px] uppercase font-black bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded">Fatura: ${esc(ir.faturaNo)}</span>` : `<span class="text-[9px] uppercase font-black bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded">Faturasız</span>`}
            </div>
            <p class="mt-2 text-slate-600">${kalemOzet || 'Kalem yok'}
              ${ir.tonaj != null ? ` · Tonaj: ${esc(ir.tonaj)}` : ''}
              ${ir.malzemeTipi ? ` · ${esc(ir.malzemeTipi)}` : ''}
            </p>
            <p class="mt-1 text-[10px] text-slate-400">İrsaliye düzenlenebilir; bağ sonradan çıkarılabilir / güncellenebilir.</p>
          </div>`;
          })
          .join('')}
      </div>`
      }
    </section>`;

  const ftBlock = `
    <section class="mb-8">
      <h2 class="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">
        3 · Mali taslak — Faturalar (${fts.length})
      </h2>
      ${
        fts.length === 0
          ? `<p class="text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl p-4">Henüz fatura bağı yok. İrsaliyeleri seçip taslak faturaya bağlayabilirsiniz.</p>`
          : `<div class="space-y-3">
        ${fts
          .map((ft) => {
            const bagli = (ft.bagliIrsaliyeler || []).map(esc).join(', ') || '—';
            return `
          <div class="border border-slate-200 bg-slate-50/60 rounded-xl p-4 text-xs">
            <div class="flex flex-wrap gap-3 font-semibold text-slate-900">
              <span>${esc(ft.faturaNo)}</span>
              <span class="text-slate-500 font-normal">${esc(ft.tarih)}</span>
              <span class="text-[9px] uppercase font-black bg-white border border-slate-200 px-1.5 py-0.5 rounded">${esc(ft.durum)}</span>
              <span class="font-mono">${money(ft.genelToplam)}</span>
            </div>
            <p class="mt-2 text-slate-600">Firma: ${esc(ft.cariUnvan)}${ft.saId ? ` · SA: ${esc(ft.saId)}` : ''}</p>
            <p class="mt-1 text-slate-600">Bağlı irsaliyeler: <strong>${bagli}</strong></p>
            <p class="mt-1 text-[10px] text-slate-400">Fatura ve bağları düzenlenebilir; hatalı bağlantı düzeltilebilir.</p>
          </div>`;
          })
          .join('')}
      </div>`
      }
    </section>`;

  const body = `
    ${getReportEmailToolbarHtml({
      subject: `Kibritçi — ${title}`,
      fileName: `Kibritci_Evrak_Zincir_${sa?.saId || 'secim'}.html`,
    })}
    <div class="mb-6">
      <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">${esc(title)}</h1>
      <p class="text-xs text-slate-500 mt-1">
        Satın Alma → İrsaliye(ler) → Fatura · Sevk ${z.sevk} · Fatura ${z.fatura}
        ${z.tamamlandi ? ' · Zincir tamam' : ' · Zincir devam ediyor'}
      </p>
      <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
        Bağlama işlemi evrakları kilitlemez. SA, irsaliye ve fatura her aşamada düzenlenebilir / güncellenebilir.
      </p>
    </div>
    ${saBlock}
    ${irBlock}
    ${ftBlock}
  `;

  return wrapCorporateReportHtml(body, {
    title,
    docCode: 'EVR-ZINCIR',
    orientation: 'portrait',
    autoPrint: false,
  });
}

export function openEvrakZincirRaporu(input: EvrakZincirRaporInput): Window | null {
  const html = buildEvrakZincirRaporHtml(input);
  const title = input.sa ? `Evrak Zinciri — ${input.sa.saId}` : 'Evrak Zinciri';
  return openHtmlReportWindow(html, title);
}
