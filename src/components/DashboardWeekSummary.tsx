import React, { useMemo } from 'react';
import { TrendingUp, ShoppingCart, Wallet, Users, ChevronRight, FileDown } from 'lucide-react';
import { Personel, SatinAlmaTalebi, KasaHareketi, AylikYoklamaMap } from '../types/erp';
import { todayDateKey } from '../lib/dateKeyUtils';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import { openHtmlReportWindow } from '../lib/reportEmail';

type Props = {
  personeller: Personel[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  kasaHareketleri: KasaHareketi[];
  yoklamalar: AylikYoklamaMap;
  onNavigate: (tab: string) => void;
};

function dateKeysLast7Days(endKey: string): Set<string> {
  const set = new Set<string>();
  const end = new Date(`${endKey}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    set.add(`${y}-${m}-${day}`);
  }
  return set;
}

function normalizeDocDate(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd.MM.yyyy
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {
    /* ignore */
  }
  return '';
}

/** Ana sayfa — son 7 gün özeti (mevcut props ile, panelleri bozmaz). */
export const DashboardWeekSummary: React.FC<Props> = ({
  personeller,
  satinAlmaTalepleri,
  kasaHareketleri,
  yoklamalar,
  onNavigate,
}) => {
  const today = todayDateKey();
  const weekKeys = useMemo(() => dateKeysLast7Days(today), [today]);

  const stats = useMemo(() => {
    const saWeek = (satinAlmaTalepleri || []).filter((sa) =>
      weekKeys.has(normalizeDocDate(sa.tarih))
    );
    const saPending = saWeek.filter(
      (sa) =>
        sa.onayDurumu === 'ONAY BEKLİYOR' ||
        sa.onayDurumu === 'BEKLİYOR' ||
        String(sa.onayDurumu || '').includes('BEKLİYOR')
    ).length;

    let kasaGiris = 0;
    let kasaCikis = 0;
    (kasaHareketleri || []).forEach((k) => {
      if (!weekKeys.has(normalizeDocDate(k.tarih))) return;
      const tutar = Number(k.tutar) || 0;
      if (k.hareketTipi === 'GİRİŞ') kasaGiris += tutar;
      else kasaCikis += tutar;
    });

    let geldi = 0;
    let yok = 0;
    Object.keys(yoklamalar || {}).forEach((pId) => {
      const map = yoklamalar[pId] || {};
      Object.entries(map).forEach(([dayKey, day]: [string, any]) => {
        // dayKey may be "1".."31" under month maps — skip if not ISO
        const iso =
          normalizeDocDate(day?.tarih) ||
          (dayKey.length >= 8 ? normalizeDocDate(dayKey) : '');
        if (iso && !weekKeys.has(iso)) return;
        // Monthly map: only count if we can resolve date; otherwise count all Geldi in current month lightly
        if (!iso) {
          // fallback: current month day numbers within last 7 calendar days
          const n = Number(dayKey);
          if (!Number.isFinite(n)) return;
          const now = new Date(`${today}T12:00:00`);
          const candidate = new Date(now.getFullYear(), now.getMonth(), n);
          const key = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
          if (!weekKeys.has(key)) return;
        }
        if (day?.durum === 'Geldi') geldi++;
        if (day?.durum === 'Yok') yok++;
      });
    });

    const activePersonel = personeller.filter(
      (p) => p.durum === true || String(p.durum) === 'true'
    ).length;

    return {
      saWeek: saWeek.length,
      saPending,
      kasaGiris,
      kasaCikis,
      kasaNet: kasaGiris - kasaCikis,
      geldi,
      yok,
      activePersonel,
    };
  }, [satinAlmaTalepleri, kasaHareketleri, yoklamalar, personeller, weekKeys, today]);

  const handleWeekPdf = () => {
    const netLabel = `${Math.round(stats.kasaNet).toLocaleString('tr-TR')} ₺`;
    const body = `
      <div class="space-y-4">
        <div>
          <h1 class="text-xl font-black uppercase tracking-wide text-slate-900">Haftalık Özet Raporu</h1>
          <p class="text-xs text-slate-500 mt-1">Son 7 gün · Bitiş: ${today} · Aktif personel: ${stats.activePersonel}</p>
        </div>
        <table class="w-full text-sm border border-slate-200" style="border-collapse:collapse">
          <thead>
            <tr class="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th class="p-2 border border-slate-200">Kalem</th>
              <th class="p-2 border border-slate-200">Değer</th>
              <th class="p-2 border border-slate-200">Not</th>
            </tr>
          </thead>
          <tbody class="text-slate-800">
            <tr>
              <td class="p-2 border border-slate-200 font-semibold">Satın alma (7g)</td>
              <td class="p-2 border border-slate-200 tabular-nums">${stats.saWeek}</td>
              <td class="p-2 border border-slate-200">${stats.saPending > 0 ? `${stats.saPending} onayda` : 'Bekleyen yok'}</td>
            </tr>
            <tr>
              <td class="p-2 border border-slate-200 font-semibold">Kasa giriş</td>
              <td class="p-2 border border-slate-200 tabular-nums">${Math.round(stats.kasaGiris).toLocaleString('tr-TR')} ₺</td>
              <td class="p-2 border border-slate-200">—</td>
            </tr>
            <tr>
              <td class="p-2 border border-slate-200 font-semibold">Kasa çıkış</td>
              <td class="p-2 border border-slate-200 tabular-nums">${Math.round(stats.kasaCikis).toLocaleString('tr-TR')} ₺</td>
              <td class="p-2 border border-slate-200">—</td>
            </tr>
            <tr>
              <td class="p-2 border border-slate-200 font-semibold">Kasa net</td>
              <td class="p-2 border border-slate-200 tabular-nums font-bold">${netLabel}</td>
              <td class="p-2 border border-slate-200">Giriş − çıkış</td>
            </tr>
            <tr>
              <td class="p-2 border border-slate-200 font-semibold">Yoklama geldi</td>
              <td class="p-2 border border-slate-200 tabular-nums">${stats.geldi}</td>
              <td class="p-2 border border-slate-200">${stats.yok > 0 ? `${stats.yok} yok` : 'Yok kaydı yok'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const html = wrapCorporateReportHtml(body, {
      docCode: `HAFTALIK-${today}`,
      orientation: 'portrait',
      title: `Kibritçi — Haftalık Özet ${today}`,
      autoPrint: false,
    });
    openHtmlReportWindow(html, `Haftalık Özet ${today}`);
  };

  const cards = [
    {
      label: 'Satın alma (7g)',
      value: String(stats.saWeek),
      hint: stats.saPending > 0 ? `${stats.saPending} onayda` : 'Bekleyen yok',
      icon: ShoppingCart,
      tab: 'satin_alma',
    },
    {
      label: 'Kasa net (7g)',
      value: `${Math.round(stats.kasaNet).toLocaleString('tr-TR')} ₺`,
      hint: 'Giriş − çıkış',
      icon: Wallet,
      tab: 'kasa',
    },
    {
      label: 'Yoklama geldi',
      value: String(stats.geldi),
      hint: stats.yok > 0 ? `${stats.yok} yok` : 'Yok kaydı yok',
      icon: Users,
      tab: 'yoklama',
    },
  ];

  return (
    <section className="rounded-2xl bg-white border border-orange-100/60 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <TrendingUp size={17} />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-none">Bu Hafta</h3>
            <p className="text-[11px] text-slate-500 mt-1">Son 7 günün kısa özeti</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleWeekPdf}
            className="text-[11px] font-bold text-orange-700 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 cursor-pointer"
          >
            <FileDown size={13} /> PDF Al
          </button>
          <button
            type="button"
            onClick={() => onNavigate('onay_islemleri')}
            className="text-[11px] font-bold text-orange-600 inline-flex items-center gap-1 hover:underline cursor-pointer"
          >
            Onaylara bak <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onNavigate(c.tab)}
              className="text-left rounded-xl border border-orange-100 bg-orange-50/30 hover:bg-orange-50 hover:border-orange-200 px-3.5 py-3 transition cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {c.label}
                </span>
                <Icon size={14} className="text-slate-400" />
              </div>
              <div className="font-display text-xl font-bold text-slate-900 mt-1 tabular-nums leading-none">
                {c.value}
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">{c.hint}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DashboardWeekSummary;
