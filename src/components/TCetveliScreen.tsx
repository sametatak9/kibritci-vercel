import React, { useMemo, useState } from 'react';
import { BookOpen, Printer, Search } from 'lucide-react';
import type { CariKart, Fatura, HazirTutanak, Irsaliye } from '../types/erp';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import { formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';
import { KIBRITCI_COMPANY } from '../lib/kibritciBrand';
import { openHtmlReportWindow } from '../lib/reportEmail';
import {
  buildTCetveliDefteri,
  tCetveliDonemLabel,
  type TCetveliSatir,
} from '../lib/tCetveliEvrak';
import { EvrakPageShell } from './evrakUi/EvrakScreenChrome';

interface TCetveliScreenProps {
  irsaliyeler?: Irsaliye[];
  faturalar?: Fatura[];
  hazirTutanaklar?: HazirTutanak[];
  cariKartlar?: CariKart[];
}

function monthStart(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function monthEnd(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${dateKey.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

function shiftMonth(dateKey: string, delta: number): string {
  const [y, m] = dateKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-01`;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tipBadge(tip: TCetveliSatir['evrakTipi']): string {
  if (tip === 'İRSALİYE') return 'bg-amber-100 text-amber-900';
  if (tip === 'FATURA') return 'bg-sky-100 text-sky-900';
  if (tip === 'SEVK') return 'bg-violet-100 text-violet-900';
  return 'bg-rose-100 text-rose-900';
}

function RowList({ rows, empty }: { rows: TCetveliSatir[]; empty: string }) {
  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-[11px] italic text-slate-400">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-stone-200">
      {rows.map((r) => (
        <li key={r.id} className="px-3 py-2.5 grid grid-cols-[72px_1fr_auto] gap-2 items-start">
          <span className="font-mono text-[10px] font-bold text-slate-500 pt-0.5">
            {formatDateLabelTr(r.tarih)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${tipBadge(r.evrakTipi)}`}>
                {r.evrakTipi}
              </span>
              <span className="text-[12px] font-black text-slate-900 truncate">{r.belgeNo}</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-800 truncate">{r.muhatap}</p>
            {r.ozet ? <p className="text-[10px] text-slate-500 truncate">{r.ozet}</p> : null}
          </div>
          <div className="text-right shrink-0">
            {r.tutar > 0 ? (
              <p className="text-[11px] font-black tabular-nums text-slate-900">
                {r.tutar.toLocaleString('tr-TR')} ₺
              </p>
            ) : r.miktar > 0 ? (
              <p className="text-[11px] font-bold tabular-nums text-slate-700">
                {r.miktar.toLocaleString('tr-TR')} {r.miktarEtiket}
              </p>
            ) : (
              <p className="text-[10px] text-slate-400">—</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function buildPrintHtml(opts: {
  defter: ReturnType<typeof buildTCetveliDefteri>;
  donem: string;
}): string {
  const rowHtml = (r: TCetveliSatir) =>
    `<tr>
      <td>${esc(formatDateLabelTr(r.tarih))}</td>
      <td>${esc(r.evrakTipi)}</td>
      <td><strong>${esc(r.belgeNo)}</strong><div class="muh">${esc(r.muhatap)}</div></td>
      <td class="num">${
        r.tutar > 0
          ? `${r.tutar.toLocaleString('tr-TR')} ₺`
          : r.miktar > 0
            ? `${r.miktar.toLocaleString('tr-TR')} ${esc(r.miktarEtiket)}`
            : '—'
      }</td>
    </tr>`;
  const body = `
    <h1 style="margin:0 0 4px;font-size:18px;letter-spacing:.04em">T CETVELİ — EVRAK DEFTERİ</h1>
    <p style="margin:0 0 14px;font-size:12px;color:#475569">${esc(KIBRITCI_COMPANY.shortName)} · ${esc(opts.donem)}</p>
    <div class="t-grid">
      <section>
        <h2>GİRİŞ · BORÇ <span>${opts.defter.girisAdet} evrak</span></h2>
        <table>
          <thead><tr><th>Tarih</th><th>Tip</th><th>Belge / muhatap</th><th>Tutar / miktar</th></tr></thead>
          <tbody>${opts.defter.giris.map(rowHtml).join('') || '<tr><td colspan="4">Kayıt yok</td></tr>'}</tbody>
        </table>
      </section>
      <section>
        <h2>ÇIKIŞ · ALACAK <span>${opts.defter.cikisAdet} evrak</span></h2>
        <table>
          <thead><tr><th>Tarih</th><th>Tip</th><th>Belge / muhatap</th><th>Tutar / miktar</th></tr></thead>
          <tbody>${opts.defter.cikis.map(rowHtml).join('') || '<tr><td colspan="4">Kayıt yok</td></tr>'}</tbody>
        </table>
      </section>
    </div>`;
  return wrapCorporateReportHtml(body, {
    title: 'T Cetveli — Kibritçi İnşaat',
    docCode: 'T-CETVELI',
    orientation: 'landscape',
    autoPrint: false,
    extraCss: `
      .t-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
      .t-grid h2{margin:0 0 8px;font-size:13px;display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:4px}
      .t-grid h2 span{font-size:11px;color:#64748b;font-weight:700}
      .t-grid table{width:100%;border-collapse:collapse;font-size:11px}
      .t-grid th,.t-grid td{border-bottom:1px solid #e2e8f0;padding:5px 6px;text-align:left;vertical-align:top}
      .t-grid .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .muh{font-size:10px;color:#64748b}
      @media print{.t-grid{gap:10px}}
    `,
  });
}

export const TCetveliScreen: React.FC<TCetveliScreenProps> = ({
  irsaliyeler = [],
  faturalar = [],
  hazirTutanaklar = [],
  cariKartlar = [],
}) => {
  const today = todayDateKey();
  const [anchor, setAnchor] = useState(monthStart(today));
  const [tumDonem, setTumDonem] = useState(false);
  const [query, setQuery] = useState('');

  const startDate = tumDonem ? '' : monthStart(anchor);
  const endDate = tumDonem ? '' : monthEnd(anchor);

  const defter = useMemo(
    () =>
      buildTCetveliDefteri({
        irsaliyeler,
        faturalar,
        hazirTutanaklar,
        cariKartlar,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        query,
      }),
    [irsaliyeler, faturalar, hazirTutanaklar, cariKartlar, startDate, endDate, query]
  );

  const donem = tumDonem ? 'Tüm dönem' : tCetveliDonemLabel(startDate, endDate);
  const ayBaslik = tumDonem
    ? 'Tüm dönem'
    : new Date(`${anchor}T00:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  return (
    <EvrakPageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Muhasebe defteri</p>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 mt-0.5">
            <BookOpen size={20} className="text-stone-700" /> T Cetveli
          </h1>
          <p className="text-[12px] text-slate-600 mt-1 max-w-2xl">
            {KIBRITCI_COMPANY.shortName} firmasına gelen ve giden evrakların toplu listesi — sol giriş (borç), sağ çıkış (alacak).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const html = buildPrintHtml({ defter, donem });
            openHtmlReportWindow(html, 'T Cetveli — Kibritçi İnşaat');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-slate-900 text-white cursor-pointer"
        >
          <Printer size={13} /> Yazdır / PDF
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTumDonem(false);
            setAnchor((p) => shiftMonth(p, -1));
          }}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-stone-200 bg-white cursor-pointer"
        >
          ← Önceki ay
        </button>
        <span className="text-[12px] font-black uppercase tracking-wide text-slate-800 min-w-[140px] text-center">
          {ayBaslik}
        </span>
        <button
          type="button"
          onClick={() => {
            setTumDonem(false);
            setAnchor((p) => shiftMonth(p, 1));
          }}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-stone-200 bg-white cursor-pointer"
        >
          Sonraki ay →
        </button>
        <button
          type="button"
          onClick={() => {
            setTumDonem(false);
            setAnchor(monthStart(today));
          }}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-stone-200 bg-white cursor-pointer"
        >
          Bu ay
        </button>
        <button
          type="button"
          onClick={() => setTumDonem(true)}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
            tumDonem ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-slate-700 border-stone-200'
          }`}
        >
          Tüm dönem
        </button>
        <label className="relative ml-auto min-w-[200px] flex-1 max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Belge no, firma, konu…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-stone-200 text-[12px] font-semibold"
          />
        </label>
      </div>

      <div className="bg-[#f6f1e7] border-2 border-stone-800 rounded-sm overflow-hidden shadow-[4px_4px_0_rgba(28,25,23,0.12)]">
        <div className="bg-stone-900 text-stone-50 px-4 py-3 text-center">
          <p className="text-[10px] font-black tracking-[0.22em] uppercase text-stone-400">Eski usul evrak defteri</p>
          <h2 className="text-base font-black tracking-wide">{KIBRITCI_COMPANY.shortName}</h2>
          <p className="text-[11px] text-stone-300 mt-0.5">{donem}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x-2 divide-stone-800 min-h-[420px]">
          <section>
            <header className="px-4 py-2.5 bg-emerald-800 text-white flex items-baseline justify-between gap-2">
              <h3 className="text-[12px] font-black uppercase tracking-widest">Giriş · Borç</h3>
              <span className="text-[11px] font-bold">
                {defter.girisAdet} evrak
                {defter.girisTutar > 0 ? ` · ${defter.girisTutar.toLocaleString('tr-TR')} ₺` : ''}
              </span>
            </header>
            <p className="px-4 py-1.5 text-[10px] font-semibold text-emerald-900 bg-emerald-50 border-b border-emerald-100">
              Şantiyeye gelen irsaliye ve alış faturaları
            </p>
            <RowList rows={defter.giris} empty="Bu dönemde giriş evrakı yok." />
          </section>
          <section>
            <header className="px-4 py-2.5 bg-rose-800 text-white flex items-baseline justify-between gap-2">
              <h3 className="text-[12px] font-black uppercase tracking-widest">Çıkış · Alacak</h3>
              <span className="text-[11px] font-bold">
                {defter.cikisAdet} evrak
                {defter.cikisTutar > 0 ? ` · ${defter.cikisTutar.toLocaleString('tr-TR')} ₺` : ''}
              </span>
            </header>
            <p className="px-4 py-1.5 text-[10px] font-semibold text-rose-900 bg-rose-50 border-b border-rose-100">
              Teslim / sevk tutanakları ve satış faturaları
            </p>
            <RowList rows={defter.cikis} empty="Bu dönemde çıkış evrakı yok." />
          </section>
        </div>
        <footer className="grid grid-cols-2 divide-x-2 divide-stone-800 border-t-2 border-stone-800 text-[11px] font-black">
          <div className="px-4 py-2.5 bg-emerald-50 text-emerald-950">
            Giriş toplamı: {defter.girisAdet} evrak
            {defter.girisTutar > 0 ? ` · ${defter.girisTutar.toLocaleString('tr-TR')} ₺` : ''}
          </div>
          <div className="px-4 py-2.5 bg-rose-50 text-rose-950">
            Çıkış toplamı: {defter.cikisAdet} evrak
            {defter.cikisTutar > 0 ? ` · ${defter.cikisTutar.toLocaleString('tr-TR')} ₺` : ''}
          </div>
        </footer>
      </div>
    </EvrakPageShell>
  );
};
