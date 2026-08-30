import type { Personel, AracBakim, SatinAlmaTalebi } from '../types/erp';
import { getKibritciLogoUrl } from './kibritciBrand';

export type PersonelTraceData = {
  person: Personel;
  attendance: { geldi: number; yok: number; izinli: number; raporlu: number };
  vehicles: AracBakim[];
  kmLogs: any[];
  purchases: SatinAlmaTalebi[];
};

export function downloadPersonelTraceReport(traceData: PersonelTraceData): void {
  const p = traceData.person;
  const heading = `Kibritci_Insaat_Personel_Islem_Gecmisi_${p.ad}_${p.soyad}`;

  const activeVehiclesHtml =
    traceData.vehicles.length === 0
      ? `<tr><td colspan="3" class="p-2.5 text-slate-400 italic text-center">Zimmetli araç bulunmuyor.</td></tr>`
      : traceData.vehicles
          .map(
            (v) => `
      <tr class="border-b text-slate-700">
        <td class="p-2.5 font-bold">${v.plaka}</td>
        <td class="p-2.5">${v.markaModel}</td>
        <td class="p-2.5 font-mono text-amber-600 font-bold">${v.mevcutKm.toLocaleString('tr-TR')} KM</td>
      </tr>`
          )
          .join('');

  const kmLogsHtml =
    traceData.kmLogs.length === 0
      ? `<tr><td colspan="3" class="p-2.5 text-slate-400 italic text-center">Kilometre sefer kaydı bulunamadı.</td></tr>`
      : traceData.kmLogs
          .map(
            (log) => `
      <tr class="border-b text-slate-700">
        <td class="p-2.5 font-mono text-slate-400">${log.tarih}</td>
        <td class="p-2.5 font-bold">${log.plaka}</td>
        <td class="p-2.5 font-mono font-bold">${log.fark} KM</td>
      </tr>`
          )
          .join('');

  const purchasesHtml =
    traceData.purchases.length === 0
      ? `<tr><td colspan="4" class="p-2.5 text-slate-400 italic text-center">Talep edilen malzeme bulunmuyor.</td></tr>`
      : traceData.purchases
          .map(
            (sa) => `
      <tr class="border-b text-slate-700">
        <td class="p-2.5 font-mono text-xs font-bold">${sa.saId}</td>
        <td class="p-2.5 font-bold">${sa.aciklama || 'Genel Şantiye Malzemesi'}</td>
        <td class="p-2.5 font-mono text-slate-400">${sa.tarih}</td>
        <td class="p-2.5"><span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${sa.onayDurumu}</span></td>
      </tr>`
          )
          .join('');

  const blob = new Blob(
    [
      `<html><head><meta charset="utf-8"><title>Personel Raporu - ${p.ad} ${p.soyad}</title><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="p-12 bg-white text-slate-800 font-sans">
        <div class="max-w-4xl mx-auto space-y-8">
          <div class="border-b-2 border-orange-200 pb-4 flex justify-between items-center">
            <img src="${getKibritciLogoUrl()}" alt="Kibritçi İnşaat" style="height:48px;width:auto;" />
            <span class="text-slate-400 font-mono text-xs">${new Date().toLocaleDateString('tr-TR')}</span>
          </div>
          <h2 class="text-center text-base font-bold uppercase tracking-wider border-y border-slate-200 py-2 bg-orange-50/50">Personel Saha Geçmişi Raporu</h2>
          <div class="grid grid-cols-2 gap-4 border p-4 rounded-xl bg-slate-50">
            <div><p class="text-[10px] text-slate-400 font-bold uppercase">Ad Soyad</p><p class="text-sm font-black">${p.ad} ${p.soyad}</p></div>
            <div><p class="text-[10px] text-slate-400 font-bold uppercase">Görev</p><p class="text-sm font-bold text-orange-700">${p.gorev}</p></div>
          </div>
          <div class="grid grid-cols-4 gap-4 text-center text-xs font-bold">
            <div class="bg-emerald-50 border border-emerald-100 p-3 rounded-xl"><p class="text-base font-black">${traceData.attendance.geldi}</p><span class="text-[10px] text-slate-400">Geldi</span></div>
            <div class="bg-rose-50 border border-rose-100 p-3 rounded-xl"><p class="text-base font-black">${traceData.attendance.yok}</p><span class="text-[10px] text-slate-400">Yok</span></div>
            <div class="bg-amber-50 border border-amber-100 p-3 rounded-xl"><p class="text-base font-black">${traceData.attendance.izinli}</p><span class="text-[10px] text-slate-400">İzin</span></div>
            <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl"><p class="text-base font-black">${traceData.attendance.raporlu}</p><span class="text-[10px] text-slate-400">Rapor</span></div>
          </div>
          <table class="w-full text-left text-xs border"><thead><tr class="bg-slate-50"><th class="p-2.5">Plaka</th><th class="p-2.5">Model</th><th class="p-2.5">KM</th></tr></thead><tbody>${activeVehiclesHtml}</tbody></table>
          <table class="w-full text-left text-xs border"><thead><tr class="bg-slate-50"><th class="p-2.5">Tarih</th><th class="p-2.5">Plaka</th><th class="p-2.5">Fark</th></tr></thead><tbody>${kmLogsHtml}</tbody></table>
          <table class="w-full text-left text-xs border"><thead><tr class="bg-slate-50"><th class="p-2.5">Kod</th><th class="p-2.5">Açıklama</th><th class="p-2.5">Tarih</th><th class="p-2.5">Durum</th></tr></thead><tbody>${purchasesHtml}</tbody></table>
        </div>
      </body></html>`,
    ],
    { type: 'text/html' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${heading}_Rapor.html`;
  a.click();
  URL.revokeObjectURL(url);
}
