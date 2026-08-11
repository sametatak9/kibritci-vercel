import type { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import {
  describeEvrakZinciri,
  findFaturalarForIrsaliye,
  findIrsaliyelerForSa,
  irsaliyeHizmetMiktari,
  isGercekFaturaGirisi,
  isTaslakMaliBagFatura,
} from './evrakDonusum';
import {
  irsaliyeNoChainSortKey,
  malzemeTipiLabel,
  micirMalzemeTipiSortKey,
  resolveMicirMalzemeTipiFromIrsaliye,
} from './micirUtils';
import { getReportEmailToolbarHtml, openHtmlReportWindow } from './reportEmail';

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

const AY_ADLARI = [
  '',
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

function ayEtiketi(ym: string): string {
  const [y, m] = ym.split('-');
  const ay = Number(m);
  if (!y || !ay) return ym || 'Tarihsiz';
  return `${AY_ADLARI[ay] || m} ${y}`;
}

function monthKeyOf(ir: Irsaliye): string {
  const key = normalizeDateKey(ir.tarih);
  return key ? key.slice(0, 7) : '0000-00';
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
    const sid = String(sa.saId).trim();
    for (const ft of faturalar) {
      if (String(ft.saId || '').trim() === sid) ftMap.set(ft.id, ft);
    }
  }
  return { sa: sa || undefined, irs, fts: [...ftMap.values()] };
}

function irFaturaDurumu(
  ir: Irsaliye,
  faturalar: Fatura[]
): {
  bagli: boolean;
  taslak: boolean;
  label: string;
  badgeClass: string;
} {
  const linked = findFaturalarForIrsaliye(ir, faturalar);
  const gercek = linked.find((ft) => isGercekFaturaGirisi(ft));
  const taslak = linked.find((ft) => isTaslakMaliBagFatura(ft));
  if (gercek) {
    return {
      bagli: true,
      taslak: false,
      label: `Faturaya bağlandı: ${gercek.faturaNo}`,
      badgeClass: 'bg-violet-100 text-violet-900 border-violet-200',
    };
  }
  if (taslak || (ir.faturaNo && linked.some((ft) => isTaslakMaliBagFatura(ft)))) {
    const no = taslak?.faturaNo || ir.faturaNo;
    return {
      bagli: false,
      taslak: true,
      label: `Taslak bağ (fatura girişi yok)${no ? `: ${no}` : ''}`,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }
  if (ir.faturaNo) {
    return {
      bagli: true,
      taslak: false,
      label: `Faturaya bağlandı: ${ir.faturaNo}`,
      badgeClass: 'bg-violet-100 text-violet-900 border-violet-200',
    };
  }
  return {
    bagli: false,
    taslak: false,
    label: 'İrsaliye — fatura bekliyor',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
  };
}

function renderIrsaliyeCard(ir: Irsaliye, faturalar: Fatura[]): string {
  const kalemOzet = (ir.kalemler || [])
    .map((k) => `${esc(k.urunAdi)}: ${esc(k.miktar)} ${esc(k.birim || '')}`)
    .join(' · ');
  const durum = irFaturaDurumu(ir, faturalar);
  const hizmet = irsaliyeHizmetMiktari(ir);
  const tarihLabel = formatDateLabelTr(ir.tarih);
  return `
          <div class="border ${
            durum.bagli
              ? 'border-violet-200 bg-violet-50/40'
              : durum.taslak
                ? 'border-slate-200 bg-slate-50/60'
                : 'border-amber-100 bg-amber-50/40'
          } rounded-xl p-4 text-xs">
            <div class="flex flex-wrap gap-3 font-semibold text-slate-900 items-center">
              <span>${esc(ir.irsaliyeNo)}</span>
              <span class="text-slate-500 font-normal">${esc(tarihLabel)} <span class="font-mono text-[10px]">(${esc(normalizeDateKey(ir.tarih) || ir.tarih || '—')})</span></span>
              ${ir.plaka ? `<span class="font-mono text-slate-600">${esc(ir.plaka)}</span>` : ''}
              ${
                hizmet.miktar > 0
                  ? `<span class="text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded">${esc(hizmet.miktar)} ${esc(hizmet.etiket)}</span>`
                  : ''
              }
              ${
                (() => {
                  const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
                  return tip
                    ? `<span class="text-[9px] uppercase font-black bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">${esc(malzemeTipiLabel(tip))}</span>`
                    : '';
                })()
              }
              ${
                ir.saId
                  ? `<span class="text-[9px] uppercase font-black bg-white border border-slate-200 px-1.5 py-0.5 rounded">SA ${esc(ir.saId)}</span>`
                  : `<span class="text-[9px] uppercase font-black bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">SA bağı zayıf</span>`
              }
              ${
                ir.kaynak
                  ? `<span class="text-[9px] uppercase font-black bg-white border border-amber-200 px-1.5 py-0.5 rounded">${esc(ir.kaynak)}</span>`
                  : ''
              }
              <span class="text-[9px] uppercase font-black border px-1.5 py-0.5 rounded ${durum.badgeClass}">${esc(durum.label)}</span>
            </div>
            <p class="mt-2 text-slate-600">${kalemOzet || 'Kalem yok'}
              ${ir.tonaj != null ? ` · Tonaj: ${esc(ir.tonaj)}` : ''}
              ${ir.malzemeTipi ? ` · ${esc(ir.malzemeTipi)}` : ''}
            </p>
            <p class="mt-1 text-[10px] text-slate-400">İrsaliye düzenlenebilir; gerçek fatura bağı sonradan kurulabilir / kaldırılabilir.</p>
          </div>`;
}

export function buildEvrakZincirRaporHtml(input: EvrakZincirRaporInput): string {
  const { sa, irs, fts } = resolveChain(input);
  const z = sa
    ? describeEvrakZinciri(sa, input.irsaliyeler, input.faturalar)
    : describeEvrakZinciri(undefined, irs, input.faturalar);
  const sevk = irs.length;
  const gercekFats = fts.filter((ft) => isGercekFaturaGirisi(ft));
  const taslakFats = fts.filter((ft) => isTaslakMaliBagFatura(ft));
  const faturaSayisi = gercekFats.length;
  const taslakSayisi = taslakFats.length;
  const faturayaBagliSevk = irs.filter((ir) => irFaturaDurumu(ir, input.faturalar).bagli).length;
  const faturasizSevk = Math.max(0, sevk - faturayaBagliSevk);
  const tamamlandi = sevk > 0 && faturaSayisi > 0 && faturasizSevk === 0;

  const toplamHizmet = irs.reduce((s, ir) => s + irsaliyeHizmetMiktari(ir).miktar, 0);
  const hizmetEtiket =
    irs.map((ir) => irsaliyeHizmetMiktari(ir).etiket).find((e) => e === 'ton') ||
    irs.map((ir) => irsaliyeHizmetMiktari(ir).etiket).find((e) => e === 'çekim') ||
    'ton';
  const toplamAgirlikLabel =
    toplamHizmet > 0
      ? `Toplam ağırlık: ${toplamHizmet.toLocaleString('tr-TR')} ${hizmetEtiket}`
      : '';

  let durumMetni = z.durumMetni;
  if (!sa && sevk > 0) {
    durumMetni =
      faturaSayisi > 0 && faturasizSevk === 0
        ? `${sevk} irsaliye faturaya bağlandı · zincir tamam`
        : faturaSayisi > 0
          ? `${faturayaBagliSevk}/${sevk} irsaliye faturaya bağlandı · ${faturasizSevk} bekliyor`
          : taslakSayisi > 0
            ? `${sevk} irsaliye · taslak mali bağ var — gerçek fatura girişi yok · toplam ${toplamHizmet.toLocaleString('tr-TR')} ${hizmetEtiket}`
            : `${sevk} sevk irsaliyesi — henüz faturaya bağlanmadı · toplam ${toplamHizmet.toLocaleString('tr-TR')} ${hizmetEtiket}`;
  } else if (sa && sevk !== z.sevk) {
    if (sevk === 0) durumMetni = 'SA’ya bağlı irsaliye yok — dönüşüm henüz kurulmadı';
    else if (faturaSayisi === 0) {
      durumMetni =
        taslakSayisi > 0
          ? `${sevk} sevk irsaliyesi · taslak mali bağ — gerçek fatura yok · toplam ${toplamHizmet.toLocaleString('tr-TR')} ${hizmetEtiket}`
          : `${sevk} sevk irsaliyesi oluştu — henüz faturaya bağlanmadı · toplam ${toplamHizmet.toLocaleString('tr-TR')} ${hizmetEtiket}`;
    } else if (faturasizSevk > 0) {
      durumMetni = `${faturayaBagliSevk}/${sevk} irsaliye faturaya bağlandı · ${faturasizSevk} bekliyor`;
    } else {
      durumMetni = `${sevk} irsaliye faturaya bağlandı · zincir tamam`;
    }
  }

  const title = sa
    ? `Evrak Zinciri — ${sa.saId}`
    : `Evrak Zinciri — ${sevk} irsaliye`;

  const durumBannerClass = tamamlandi
    ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
    : sevk === 0
      ? 'text-slate-700 bg-slate-50 border-slate-200'
      : faturaSayisi === 0
        ? 'text-amber-900 bg-amber-50 border-amber-200'
        : 'text-violet-900 bg-violet-50 border-violet-200';

  const saBlock = sa
    ? `
    <section class="mb-8">
      <h2 class="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">1 · İlk hali — Satın Alma</h2>
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <div class="bg-slate-50 px-4 py-3 flex flex-wrap gap-4 text-xs">
          <div><span class="text-slate-500">SA No:</span> <strong>${esc(sa.saId)}</strong></div>
          <div><span class="text-slate-500">Tarih:</span> <strong>${esc(formatDateLabelTr(sa.tarih))}</strong></div>
          <div><span class="text-slate-500">Firma:</span> <strong>${esc(sa.cariFirma || '—')}</strong></div>
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

  const byMonth = new Map<string, Irsaliye[]>();
  const sortedIrs = [...irs].sort((a, b) => {
    const aTip = resolveMicirMalzemeTipiFromIrsaliye(a);
    const bTip = resolveMicirMalzemeTipiFromIrsaliye(b);
    if (aTip || bTip) {
      const ak = aTip != null ? micirMalzemeTipiSortKey(aTip) : 99;
      const bk = bTip != null ? micirMalzemeTipiSortKey(bTip) : 99;
      if (ak !== bk) return ak - bk;
    }
    const d = String(normalizeDateKey(a.tarih) || a.tarih || '').localeCompare(
      String(normalizeDateKey(b.tarih) || b.tarih || '')
    );
    if (d !== 0) return d;
    return irsaliyeNoChainSortKey(a.irsaliyeNo) - irsaliyeNoChainSortKey(b.irsaliyeNo);
  });
  for (const ir of sortedIrs) {
    const mk = monthKeyOf(ir);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk)!.push(ir);
  }
  const monthKeys = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  const irBlock = `
    <section class="mb-8">
      <h2 class="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">
        2 · Dönüşüm — Sevk irsaliyeleri (${sevk})
        ${toplamAgirlikLabel ? ` · ${esc(toplamAgirlikLabel)}` : ''}
      </h2>
      ${
        toplamHizmet > 0
          ? `<p class="text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 mb-3">
              <strong>${esc(toplamAgirlikLabel)}</strong>
              ${sa ? ` · Satın alma: <strong>${esc(sa.saId)}</strong> · ${esc(sa.cariFirma || '')}` : ''}
            </p>`
          : ''
      }
      ${
        sevk === 0
          ? `<p class="text-xs text-slate-600 border border-dashed border-slate-200 rounded-xl p-4">
              Bu satın almaya bağlı irsaliye bulunamadı.<br/>
              <span class="text-slate-500">
                Kapıdan girilen mıcır/stabilize fişi yalnızca <strong>yönetici onayı</strong> sonrası
                «İrsaliyeler» koleksiyonuna yazılır ve SA bağı kurulursa burada görünür.
              </span>
            </p>`
          : `<div class="space-y-5">
        ${monthKeys
          .map((mk) => {
            const list = byMonth.get(mk) || [];
            const ayToplam = list.reduce((s, ir) => s + irsaliyeHizmetMiktari(ir).miktar, 0);
            return `
          <div>
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
              <h3 class="text-[11px] font-black uppercase tracking-wider text-indigo-800">${esc(ayEtiketi(mk))}</h3>
              <span class="text-[10px] font-bold text-slate-600">
                ${list.length} irsaliye
                ${ayToplam > 0 ? ` · ${ayToplam.toLocaleString('tr-TR')} ${hizmetEtiket}` : ''}
              </span>
            </div>
            <div class="space-y-3">
              ${list.map((ir) => renderIrsaliyeCard(ir, input.faturalar)).join('')}
            </div>
          </div>`;
          })
          .join('')}
      </div>`
      }
    </section>`;

  const ftBlock = `
    <section class="mb-8">
      <h2 class="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">
        3 · Mali bağ
        ${faturaSayisi > 0 ? ` — Faturalar (${faturaSayisi})` : ''}
        ${taslakSayisi > 0 ? ` — Taslak bağ (${taslakSayisi})` : faturaSayisi === 0 ? ' — henüz gerçek fatura yok' : ''}
      </h2>
      ${
        faturaSayisi === 0 && taslakSayisi === 0
          ? `<p class="text-xs text-slate-600 border border-dashed border-slate-200 rounded-xl p-4">
              Henüz <strong>fatura girişi</strong> yok. Kayıtlar <strong>irsaliye</strong> olarak durur.<br/>
              <span class="text-slate-500">Cari Kartlar → Geçmiş İrsaliyeler’den aylık seçim yapıp gerçek faturaya dönüştürün.</span>
            </p>`
          : `<div class="space-y-3">
        ${
          toplamHizmet > 0
            ? `<p class="text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                Bağ kapsamı: <strong>${sevk} irsaliye</strong> ·
                Toplam alınan hizmet: <strong>${toplamHizmet.toLocaleString('tr-TR')} ${hizmetEtiket}</strong>
                ${monthKeys.length ? ` · Dönemler: ${monthKeys.map(ayEtiketi).join(', ')}` : ''}
              </p>`
            : ''
        }
        ${[...gercekFats, ...taslakFats]
          .map((ft) => {
            const bagliIrs = irs.filter((ir) => {
              const bagli = ft.bagliIrsaliyeler || [];
              return bagli.includes(ir.id) || bagli.includes(ir.irsaliyeNo) || ir.faturaNo === ft.faturaNo;
            });
            const bagliCount = bagliIrs.length || (ft.bagliIrsaliyeler || []).length;
            const bagliHizmet = bagliIrs.reduce((s, ir) => s + irsaliyeHizmetMiktari(ir).miktar, 0);
            const bagli = (ft.bagliIrsaliyeler || []).map(esc).join(', ') || '—';
            const taslak = isTaslakMaliBagFatura(ft);
            return `
          <div class="border ${taslak ? 'border-slate-200 bg-slate-50/80' : 'border-violet-200 bg-violet-50/50'} rounded-xl p-4 text-xs">
            <div class="flex flex-wrap gap-3 font-semibold text-slate-900 items-center">
              <span>${esc(ft.faturaNo)}</span>
              <span class="text-slate-500 font-normal">${esc(formatDateLabelTr(ft.tarih))}</span>
              ${
                taslak
                  ? `<span class="text-[9px] uppercase font-black bg-slate-200 text-slate-800 border border-slate-300 px-1.5 py-0.5 rounded">Taslak bağ — fatura girişi değil</span>`
                  : `<span class="text-[9px] uppercase font-black bg-violet-100 text-violet-900 border border-violet-200 px-1.5 py-0.5 rounded">Gerçek fatura</span>`
              }
              <span class="text-[9px] uppercase font-black bg-white border border-slate-200 px-1.5 py-0.5 rounded">${esc(ft.durum)}</span>
              <span class="font-mono">${money(ft.genelToplam)}</span>
            </div>
            <p class="mt-2 text-slate-600">Firma: ${esc(ft.cariUnvan)}${ft.saId ? ` · SA: ${esc(ft.saId)}` : ''}</p>
            <p class="mt-1 text-slate-800 font-semibold">
              ${bagliCount} irsaliye ·
              ${bagliHizmet > 0 ? `toplam ${bagliHizmet.toLocaleString('tr-TR')} ${hizmetEtiket}` : 'miktar yok'}
              ${taslak ? ' (fiyat girilince gerçek fatura olur)' : ''}
            </p>
            <p class="mt-1 text-[10px] text-slate-500 break-all">${bagli}</p>
            <p class="mt-1 text-[10px] text-slate-400">Bağlar düzenlenebilir; hatalı bağlantı düzeltilebilir.</p>
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
        Satın Alma → İrsaliye(ler) → Fatura · Sevk ${sevk}
        ${toplamHizmet > 0 ? ` · ${esc(toplamAgirlikLabel)}` : ''}
        · Gerçek fatura ${faturaSayisi}${taslakSayisi ? ` · Taslak ${taslakSayisi}` : ''}
        ${tamamlandi ? ' · Zincir tamam' : ' · Zincir devam ediyor'}
      </p>
      <p class="text-[11px] border rounded-lg px-3 py-2 mt-3 font-semibold ${durumBannerClass}">
        ${esc(durumMetni)}
      </p>
      <p class="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mt-2">
        Onay sonrası kayıt <strong>irsaliye</strong>dir. Matrahı 0 olan «FAT-…» kayıtları gerçek fatura girişi değildir;
        aylık mutabakatta irsaliyeleri seçip faturaya dönüştürün. Rapor aylık gruplarla netleştirilir.
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
  const win = openHtmlReportWindow(html, title);
  // Antetli Excel (logo + toplam ağırlık + SA + irsaliyeler) — HTML ile birlikte
  void import('./evrakZincirExcelExport')
    .then(({ exportEvrakZincirExcel }) => exportEvrakZincirExcel(input))
    .catch((err) => console.error('Evrak zinciri Excel üretilemedi:', err));
  return win;
}

export async function openEvrakZincirExcel(input: EvrakZincirRaporInput) {
  const { exportEvrakZincirExcel } = await import('./evrakZincirExcelExport');
  return exportEvrakZincirExcel(input);
}
