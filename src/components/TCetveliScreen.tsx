import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Printer, Search, Pencil, Trash2, Save, X, Plus, FileText } from 'lucide-react';
import type { CariKart, CariKartIslem, Fatura, HazirTutanak, Irsaliye, IrsaliyeItem } from '../types/erp';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import { formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';
import { removeDocument } from '../lib/firebase';
import { getKibritciLogoUrl, KIBRITCI_COMPANY } from '../lib/kibritciBrand';
import { openHtmlReportWindow } from '../lib/reportEmail';
import {
  buildTCetveliDefteri,
  buildTCetveliSatirHtml,
  tCetveliDonemLabel,
  type TCetveliKalem,
  type TCetveliSatir,
} from '../lib/tCetveliEvrak';
import { EvrakPageShell } from './evrakUi/EvrakScreenChrome';

interface TCetveliScreenProps {
  irsaliyeler?: Irsaliye[];
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar?: Fatura[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  hazirTutanaklar?: HazirTutanak[];
  setHazirTutanaklar?: React.Dispatch<React.SetStateAction<HazirTutanak[]>>;
  cariKartlar?: CariKart[];
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
}

type EditKalem = {
  id: string;
  urunAdi: string;
  miktar: string;
  birim: string;
};

type EditForm = {
  tarih: string;
  belgeNo: string;
  muhatap: string;
  plaka: string;
  onayDurumu: string;
  miktar: string;
  tutar: string;
  kalemler: EditKalem[];
};

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

function stripFaturaNo(ir: Irsaliye): Irsaliye {
  const next = { ...ir };
  delete next.faturaNo;
  return next;
}

async function silentRemove(collectionName: string, id?: string | null) {
  if (!id) return;
  try {
    await removeDocument(collectionName, id);
  } catch {
    /* kayıt yoksa sorun değil */
  }
}

function kalemlerToForm(kalemler: TCetveliKalem[]): EditKalem[] {
  if (!kalemler.length) {
    return [{ id: `kl_${Date.now()}`, urunAdi: '', miktar: '', birim: '' }];
  }
  return kalemler.map((k) => ({
    id: k.id,
    urunAdi: k.urunAdi,
    miktar: k.miktar ? String(k.miktar) : '',
    birim: k.birim,
  }));
}

function formKalemlerToIrsaliye(formKalemler: EditKalem[], existing: IrsaliyeItem[]): IrsaliyeItem[] {
  return formKalemler
    .filter((k) => k.urunAdi.trim() || String(k.miktar).trim())
    .map((k, i) => {
      const prev = existing.find((x) => x.id === k.id);
      return {
        id: k.id || `kl_${Date.now()}_${i}`,
        saKalemId: prev?.saKalemId,
        stokKartId: prev?.stokKartId,
        urunAdi: k.urunAdi.trim() || `Kalem ${i + 1}`,
        miktar: Number(String(k.miktar).replace(',', '.')) || 0,
        birim: k.birim.trim() || prev?.birim || 'adet',
      };
    });
}

function applyIrsaliyeMiktar(ir: Irsaliye, miktar: number): Irsaliye {
  const next = { ...ir };
  const micir =
    ir.kaynak === 'MICIR_STABILIZE_FIS' ||
    Boolean(ir.malzemeTipi) ||
    Boolean(ir.micirFisId) ||
    ir.tonaj != null;
  if (micir) {
    next.tonaj = miktar;
    next.kiloKg = Math.round(miktar * 1000);
    return next;
  }
  if (ir.cekimAdedi != null || ir.kaynak === 'VIDANJOR_FIS' || ir.kaynak === 'YILDIRIM_TANKER_FIS') {
    next.cekimAdedi = miktar;
    return next;
  }
  return next;
}

function formFromSatir(row: TCetveliSatir, irsaliyeler: Irsaliye[], faturalar: Fatura[]): EditForm {
  if (row.kaynak === 'irsaliye') {
    const ir = irsaliyeler.find((x) => x.id === row.kaynakId);
    return {
      tarih: row.tarih,
      belgeNo: ir?.irsaliyeNo || row.belgeNo,
      muhatap: ir?.firma || row.muhatap,
      plaka: ir?.plaka || '',
      onayDurumu: ir?.onayDurumu || '',
      miktar: String(row.miktar || ''),
      tutar: '',
      kalemler: kalemlerToForm(row.kalemler),
    };
  }
  const ft = faturalar.find((x) => x.id === row.kaynakId);
  return {
    tarih: row.tarih,
    belgeNo: ft?.faturaNo || row.belgeNo,
    muhatap: ft?.cariUnvan || row.muhatap,
    plaka: '',
    onayDurumu: ft?.durum || '',
    miktar: '',
    tutar: String(ft?.genelToplam ?? row.tutar ?? ''),
    kalemler: kalemlerToForm(row.kalemler),
  };
}

function buildPrintHtml(opts: {
  defter: ReturnType<typeof buildTCetveliDefteri>;
  donem: string;
}): string {
  const kalemHtml = (r: TCetveliSatir) =>
    r.kalemler.length
      ? `<ul class="kalem">${r.kalemler
          .map(
            (k) =>
              `<li>${esc(k.urunAdi)}${
                k.miktar ? ` — ${k.miktar.toLocaleString('tr-TR')} ${esc(k.birim)}` : ''
              }</li>`
          )
          .join('')}</ul>`
      : `<div class="muh">${esc(r.hizmetOzet || '—')}</div>`;
  const rowHtml = (r: TCetveliSatir, i: number) =>
    `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(formatDateLabelTr(r.tarih))}</td>
      <td>${esc(r.evrakTipi)}<div class="muh">${esc(r.kaynakEtiket)}</div></td>
      <td><strong>${esc(r.belgeNo)}</strong><div class="muh">${esc(r.muhatap)}</div></td>
      <td>${esc(r.plaka || '—')}</td>
      <td>${esc(r.durum || '—')}</td>
      <td>${kalemHtml(r)}</td>
      <td class="num">${
        r.tutar > 0
          ? `${r.tutar.toLocaleString('tr-TR')} ₺`
          : r.miktar > 0
            ? `${r.miktar.toLocaleString('tr-TR')} ${esc(r.miktarEtiket)}`
            : '—'
      }</td>
    </tr>`;
  const body = `
    <h1 style="margin:0 0 4px;font-size:18px;letter-spacing:.08em">GELEN EVRAK DEFTERİ</h1>
    <p style="margin:0 0 14px;font-size:12px;color:#475569">${esc(KIBRITCI_COMPANY.legalName)} · ${esc(opts.donem)} · ${opts.defter.girisAdet} evrak</p>
    <table class="gelen">
      <thead>
        <tr>
          <th>#</th><th>Tarih</th><th>Cins</th><th>Belge / cari</th>
          <th>Plaka</th><th>Durum</th><th>Hizmet / kalemler</th><th>Miktar</th>
        </tr>
      </thead>
      <tbody>${opts.defter.evraklar.map(rowHtml).join('') || '<tr><td colspan="8">Kayıt yok</td></tr>'}</tbody>
    </table>`;
  return wrapCorporateReportHtml(body, {
    title: 'Gelen Evrak Defteri — Kibritçi İnşaat',
    docCode: 'GELEN-EVRAK',
    orientation: 'landscape',
    autoPrint: false,
    extraCss: `
      .gelen{width:100%;border-collapse:collapse;font-size:11px}
      .gelen th,.gelen td{border-bottom:1px solid #cbd5e1;padding:6px 7px;text-align:left;vertical-align:top}
      .gelen th{background:#0f2744;color:#f4ead5;font-size:10px;letter-spacing:.04em}
      .gelen .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .muh{font-size:10px;color:#64748b}
      .kalem{margin:0;padding-left:16px}
      .kalem li{margin:0 0 2px}
    `,
  });
}

export const TCetveliScreen: React.FC<TCetveliScreenProps> = ({
  irsaliyeler = [],
  setIrsaliyeler,
  faturalar = [],
  setFaturalar,
  hazirTutanaklar = [],
  cariKartlar = [],
  setCariIslemGecmisi,
}) => {
  const today = todayDateKey();
  const [anchor, setAnchor] = useState(monthStart(today));
  const [tumDonem, setTumDonem] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftRow, setDraftRow] = useState<TCetveliSatir | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [busy, setBusy] = useState(false);

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

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return defter.evraklar.find((r) => r.id === selectedId) || (draftRow?.id === selectedId ? draftRow : null);
  }, [selectedId, defter, draftRow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedId(null);
      setDraftRow(null);
      setForm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const donem = tumDonem ? 'Tüm dönem' : tCetveliDonemLabel(startDate, endDate);
  const ayBaslik = tumDonem
    ? 'Tüm dönem'
    : new Date(`${anchor}T00:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const defterKodu = tumDonem ? 'EVR-TUM' : `EVR-${anchor.slice(0, 7).replace('-', '')}`;

  const openEdit = (row: TCetveliSatir) => {
    setSelectedId(row.id);
    setDraftRow(row);
    setForm(formFromSatir(row, irsaliyeler, faturalar));
  };

  const closeEdit = () => {
    setSelectedId(null);
    setDraftRow(null);
    setForm(null);
  };

  const handleSave = async () => {
    if (!selected || !form) return;
    if (!form.tarih.trim() || !form.belgeNo.trim()) {
      alert('Tarih ve belge no zorunludur.');
      return;
    }
    setBusy(true);
    try {
      if (selected.kaynak === 'irsaliye') {
        if (!setIrsaliyeler) throw new Error('İrsaliye kaydı bağlı değil.');
        const miktar = Number(String(form.miktar).replace(',', '.'));
        setIrsaliyeler((prev) =>
          prev.map((ir) => {
            if (ir.id !== selected.kaynakId) return ir;
            let next: Irsaliye = {
              ...ir,
              tarih: form.tarih,
              irsaliyeNo: form.belgeNo.trim(),
              firma: form.muhatap.trim() || ir.firma,
              plaka: form.plaka.trim(),
              onayDurumu: form.onayDurumu.trim() || ir.onayDurumu,
              kalemler: formKalemlerToIrsaliye(form.kalemler, ir.kalemler || []),
            };
            if (Number.isFinite(miktar) && miktar >= 0 && form.miktar !== '') {
              next = applyIrsaliyeMiktar(next, miktar);
            }
            return next;
          })
        );
      } else {
        if (!setFaturalar) throw new Error('Fatura kaydı bağlı değil.');
        const tutar = Number(String(form.tutar).replace(',', '.'));
        setFaturalar((prev) =>
          prev.map((ft) => {
            if (ft.id !== selected.kaynakId) return ft;
            const genel = Number.isFinite(tutar) ? tutar : Number(ft.genelToplam || 0);
            const kalemler = form.kalemler
              .filter((k) => k.urunAdi.trim() || String(k.miktar).trim())
              .map((k, i) => {
                const prevK = (ft.kalemler || []).find((x) => x.id === k.id);
                const miktarK = Number(String(k.miktar).replace(',', '.')) || 0;
                const birimFiyat = Number(prevK?.birimFiyat || 0);
                const kdvOran = Number(prevK?.kdvOran || 0);
                const toplam = prevK?.toplam ?? miktarK * birimFiyat;
                return {
                  id: k.id || `fk_${Date.now()}_${i}`,
                  urunAdi: k.urunAdi.trim() || `Kalem ${i + 1}`,
                  miktar: miktarK,
                  birim: k.birim.trim() || prevK?.birim || 'adet',
                  birimFiyat,
                  kdvOran,
                  toplam,
                  stokKartId: prevK?.stokKartId,
                };
              });
            return {
              ...ft,
              tarih: form.tarih,
              faturaNo: form.belgeNo.trim(),
              cariUnvan: form.muhatap.trim() || ft.cariUnvan,
              genelToplam: genel,
              toplamTutar: genel,
              durum: (form.onayDurumu.trim() || ft.durum) as Fatura['durum'],
              kalemler,
            };
          })
        );
      }
      const savedKalemler = form.kalemler
        .filter((k) => k.urunAdi.trim() || String(k.miktar).trim())
        .map((k) => ({
          id: k.id,
          urunAdi: k.urunAdi.trim(),
          miktar: Number(String(k.miktar).replace(',', '.')) || 0,
          birim: k.birim.trim(),
        }));
      setDraftRow({
        ...selected,
        tarih: form.tarih,
        belgeNo: form.belgeNo.trim(),
        muhatap: form.muhatap.trim() || selected.muhatap,
        plaka: form.plaka.trim(),
        durum: form.onayDurumu.trim() || selected.durum,
        kalemler: savedKalemler,
        hizmetOzet: savedKalemler.map((k) => `${k.urunAdi} · ${k.miktar} ${k.birim}`.trim()).join(' | '),
        tutar: selected.kaynak === 'fatura' ? Number(String(form.tutar).replace(',', '.')) || selected.tutar : selected.tutar,
        miktar: Number(String(form.miktar).replace(',', '.')) || selected.miktar,
      });
    } catch (err: any) {
      alert('Kayıt başarısız: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleViewEvrak = (row: TCetveliSatir) => {
    const html = buildTCetveliSatirHtml(row);
    const printWin = openHtmlReportWindow(html, `${row.evrakTipi} ${row.belgeNo || ''}`.trim());
    if (!printWin) {
      alert('Lütfen tarayıcınızın pop-up engelleyicisini kapatın; evrak yeni pencerede açılır.');
    }
  };

  const handleDelete = async (row: TCetveliSatir) => {
    const ir = row.kaynak === 'irsaliye' ? irsaliyeler.find((x) => x.id === row.kaynakId) : null;
    const ft = row.kaynak === 'fatura' ? faturalar.find((x) => x.id === row.kaynakId) : null;
    const extra =
      ir?.faturaNo
        ? `\nBu irsaliye ${ir.faturaNo} faturasına bağlı; silinince fatura bağı kalkar, fatura kalır.`
        : ft && (ft.bagliIrsaliyeler || []).length
          ? `\nBağlı ${(ft.bagliIrsaliyeler || []).length} irsaliyenin fatura no'su temizlenecek.`
          : '';
    if (
      !window.confirm(
        `${row.evrakTipi} ${row.belgeNo} defterden silinsin mi?${extra}\n\nBu işlem geri alınamaz.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      if (row.kaynak === 'irsaliye') {
        setIrsaliyeler?.((prev) =>
          prev.filter((x) => {
            if (x.id === row.kaynakId) return false;
            if (ir?.irsaliyeId && ir.irsaliyeId !== ir.id && x.irsaliyeId === ir.irsaliyeId) return false;
            return true;
          })
        );
        setCariIslemGecmisi?.((prev) =>
          prev.filter((x) => x.islemId !== row.kaynakId && x.islemId !== ir?.irsaliyeId)
        );
        if (ir?.faturaNo) {
          setFaturalar?.((prev) =>
            prev.map((f) => {
              if (f.faturaNo !== ir.faturaNo) return f;
              return {
                ...f,
                bagliIrsaliyeler: (f.bagliIrsaliyeler || []).filter(
                  (ref) => ref !== ir.id && ref !== ir.irsaliyeNo && ref !== ir.irsaliyeId
                ),
              };
            })
          );
        }
        await silentRemove('micirStabilizeFisleri', ir?.micirFisId);
        await silentRemove('vidanjorFisleri', ir?.vidanjorFisId);
        await silentRemove('yildirimTankerFisleri', ir?.yildirimTankerFisId);
        await silentRemove('guvenlikGelenEvraklar', ir?.guvenlikEvrakId);
      } else if (row.kaynak === 'fatura') {
        const bagli = new Set((ft?.bagliIrsaliyeler || []).map(String));
        setFaturalar?.((prev) => prev.filter((x) => x.id !== row.kaynakId));
        setIrsaliyeler?.((prev) =>
          prev.map((x) => {
            const hit =
              x.faturaNo === ft?.faturaNo || bagli.has(x.id) || bagli.has(x.irsaliyeNo) || bagli.has(x.irsaliyeId);
            return hit ? stripFaturaNo(x) : x;
          })
        );
        setCariIslemGecmisi?.((prev) => prev.filter((x) => x.islemId !== row.kaynakId));
      }
      closeEdit();
    } catch (err: any) {
      alert('Silinemedi: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const renderTable = (rows: TCetveliSatir[]) => {
    if (!rows.length) {
      return (
        <p className="px-4 py-12 text-center text-[11px] italic text-slate-400">
          Bu dönemde gelen evrak yok.
        </p>
      );
    }
    return (
      <table className="w-full text-[11px] border-collapse">
        <thead className="sticky top-0 z-[1] bg-[#0f2744] text-[#f4ead5]">
          <tr className="text-left font-black uppercase tracking-wide">
            <th className="px-2 py-2 w-8">#</th>
            <th className="px-2 py-2 w-[78px]">Tarih</th>
            <th className="px-2 py-2 w-[150px]">Belge</th>
            <th className="px-2 py-2 w-[160px]">Cari</th>
            <th className="px-2 py-2 w-[88px]">Plaka</th>
            <th className="px-2 py-2 w-[110px]">Durum</th>
            <th className="px-2 py-2">Hizmet / kalemler</th>
            <th className="px-2 py-2 text-right w-[92px]">Miktar</th>
            <th className="px-2 py-2 w-[118px] text-right">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const active = selectedId === r.id;
            return (
              <tr
                key={r.id}
                onClick={() => openEdit(r)}
                className={`border-b border-slate-200 cursor-pointer align-top ${
                  active ? 'bg-amber-100' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                } hover:bg-amber-50`}
              >
                <td className="px-2 py-2 font-mono text-slate-500">{i + 1}</td>
                <td className="px-2 py-2 font-mono whitespace-nowrap">{formatDateLabelTr(r.tarih)}</td>
                <td className="px-2 py-2">
                  <span className="text-[8px] font-black uppercase tracking-wide text-slate-500 block">
                    {r.evrakTipi} · {r.kaynakEtiket}
                  </span>
                  <span className="font-black text-slate-900">{r.belgeNo}</span>
                  {r.faturaNo && r.kaynak === 'irsaliye' ? (
                    <span className="block text-[10px] text-slate-500">Fatura {r.faturaNo}</span>
                  ) : null}
                  {r.saId ? <span className="block text-[10px] text-slate-500">SA {r.saId}</span> : null}
                </td>
                <td className="px-2 py-2 font-semibold text-slate-800">{r.muhatap}</td>
                <td className="px-2 py-2 font-mono uppercase">{r.plaka || '—'}</td>
                <td className="px-2 py-2">
                  <span className="text-[10px] font-bold">{r.durum || '—'}</span>
                  {r.malzemeTipi ? (
                    <span className="block text-[10px] text-emerald-800 font-bold">{r.malzemeTipi}</span>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  {r.kalemler.length ? (
                    <ul className="m-0 pl-4 space-y-0.5">
                      {r.kalemler.map((k) => (
                        <li key={k.id} className="text-slate-800">
                          <span className="font-semibold">{k.urunAdi || '—'}</span>
                          {k.miktar ? (
                            <span className="tabular-nums text-slate-600">
                              {' '}
                              — {k.miktar.toLocaleString('tr-TR')} {k.birim}
                            </span>
                          ) : k.birim ? (
                            <span className="text-slate-600"> — {k.birim}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-500 italic">{r.hizmetOzet || 'Kalem yok'}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-black whitespace-nowrap">
                  {r.tutar > 0
                    ? `${r.tutar.toLocaleString('tr-TR')} ₺`
                    : r.miktar > 0
                      ? `${r.miktar.toLocaleString('tr-TR')} ${r.miktarEtiket}`
                      : '—'}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleViewEvrak(r)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[9px] font-black bg-[#c4a35a] text-[#0f2744] cursor-pointer mr-1 disabled:opacity-50"
                    title="Antetli evrakı HTML olarak gör"
                  >
                    <FileText size={10} /> Evrakı Gör
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEdit(r)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[9px] font-black bg-[#0f2744] text-white cursor-pointer mr-1 disabled:opacity-50"
                    title="Düzelt"
                  >
                    <Pencil size={10} /> Düzelt
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(r)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[9px] font-black bg-rose-800 text-white cursor-pointer disabled:opacity-50"
                    title="Sil"
                  >
                    <Trash2 size={10} /> Sil
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <EvrakPageShell>
      <div className="bg-[#0f2744] text-[#f4ead5] rounded-sm px-4 py-3 flex flex-wrap items-start justify-between gap-3 border border-[#c4a35a]/40">
        <div className="flex items-start gap-3 min-w-0">
          <img
            src={getKibritciLogoUrl()}
            alt=""
            className="h-11 w-auto bg-white rounded-sm p-1 shrink-0"
          />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-[#c4a35a]">
              Kibritçi ERP · Gelen evrak defteri
            </p>
            <h1 className="text-lg font-black tracking-wide flex items-center gap-2 mt-0.5">
              <BookOpen size={18} className="text-[#c4a35a]" /> T Cetveli
            </h1>
            <p className="text-[11px] text-slate-300 mt-1 max-w-2xl">
              {KIBRITCI_COMPANY.legalName} — şantiyeye gelen irsaliye ve alış faturaları; kalem ve hizmet detayı.
            </p>
          </div>
        </div>
        <div className="text-right text-[10px] font-mono">
          <p className="text-[#c4a35a] font-black">DEFTER {defterKodu}</p>
          <p className="text-slate-300">{donem}</p>
          <button
            type="button"
            onClick={() => {
              const html = buildPrintHtml({ defter, donem });
              openHtmlReportWindow(html, 'Gelen Evrak Defteri — Kibritçi İnşaat');
            }}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[10px] font-black bg-[#c4a35a] text-[#0f2744] cursor-pointer"
          >
            <Printer size={12} /> Yazdır / PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-300 rounded-sm px-3 py-2">
        <button
          type="button"
          onClick={() => {
            setTumDonem(false);
            setAnchor((p) => shiftMonth(p, -1));
          }}
          className="px-2.5 py-1 rounded-sm text-[11px] font-bold border border-slate-300 bg-slate-50 cursor-pointer"
        >
          ← Önceki ay
        </button>
        <span className="text-[12px] font-black uppercase tracking-wide text-[#0f2744] min-w-[140px] text-center">
          {ayBaslik}
        </span>
        <button
          type="button"
          onClick={() => {
            setTumDonem(false);
            setAnchor((p) => shiftMonth(p, 1));
          }}
          className="px-2.5 py-1 rounded-sm text-[11px] font-bold border border-slate-300 bg-slate-50 cursor-pointer"
        >
          Sonraki ay →
        </button>
        <button
          type="button"
          onClick={() => {
            setTumDonem(false);
            setAnchor(monthStart(today));
          }}
          className="px-2.5 py-1 rounded-sm text-[11px] font-bold border border-slate-300 bg-slate-50 cursor-pointer"
        >
          Bu ay
        </button>
        <button
          type="button"
          onClick={() => setTumDonem(true)}
          className={`px-2.5 py-1 rounded-sm text-[11px] font-bold border cursor-pointer ${
            tumDonem ? 'bg-[#0f2744] text-white border-[#0f2744]' : 'bg-slate-50 text-slate-700 border-slate-300'
          }`}
        >
          Tüm dönem
        </button>
        <label className="relative ml-auto min-w-[200px] flex-1 max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Belge no, cari, kalem, plaka…"
            className="w-full pl-8 pr-3 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold"
          />
        </label>
      </div>

      <div className="border border-[#0f2744] rounded-sm overflow-hidden bg-[#fbf7ee]">
        <div className="bg-[#0f2744] text-[#f4ead5] px-3 py-1.5 text-[10px] font-black tracking-[0.14em] uppercase flex flex-wrap justify-between gap-2">
          <span>Gelen evrak defteri · {KIBRITCI_COMPANY.shortName} · {donem}</span>
          <span className="tabular-nums">{defter.girisAdet} evrak</span>
        </div>
        <div className="max-h-[62vh] overflow-auto min-h-[320px]">{renderTable(defter.evraklar)}</div>
        <div className="px-3 py-2 bg-[#0f2744] text-[#f4ead5] text-[10px] font-black flex flex-wrap justify-between gap-2">
          <span>Dönem gelen evrak</span>
          <span className="tabular-nums">
            {defter.girisAdet} evrak
            {defter.girisTutar > 0 ? ` · ${defter.girisTutar.toLocaleString('tr-TR')} ₺` : ''}
          </span>
        </div>
      </div>

      {selected && form && (
        <div className="border border-[#0f2744] rounded-sm bg-[#f8f5ee] p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#c4a35a]">
                Gelen evrak düzeltme
              </p>
              <h3 className="text-sm font-black text-[#0f2744]">
                {selected.evrakTipi} · {selected.belgeNo} · {selected.kaynakEtiket}
              </h3>
            </div>
            <button
              type="button"
              onClick={closeEdit}
              className="p-1.5 rounded-sm border border-slate-300 bg-white cursor-pointer"
              title="Kapat"
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <label className="text-[10px] font-black uppercase text-slate-500 space-y-1">
              Tarih
              <input
                type="date"
                value={form.tarih}
                onChange={(e) => setForm({ ...form, tarih: e.target.value })}
                className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white"
              />
            </label>
            <label className="text-[10px] font-black uppercase text-slate-500 space-y-1">
              Belge no
              <input
                value={form.belgeNo}
                onChange={(e) => setForm({ ...form, belgeNo: e.target.value })}
                className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white uppercase"
              />
            </label>
            <label className="text-[10px] font-black uppercase text-slate-500 space-y-1 col-span-2">
              Cari / muhatap
              <input
                value={form.muhatap}
                onChange={(e) => setForm({ ...form, muhatap: e.target.value })}
                className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white"
              />
            </label>
            {selected.kaynak === 'irsaliye' && (
              <>
                <label className="text-[10px] font-black uppercase text-slate-500 space-y-1">
                  Plaka
                  <input
                    value={form.plaka}
                    onChange={(e) => setForm({ ...form, plaka: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white uppercase"
                  />
                </label>
                <label className="text-[10px] font-black uppercase text-slate-500 space-y-1">
                  Miktar ({selected.miktarEtiket || 'adet'})
                  <input
                    value={form.miktar}
                    onChange={(e) => setForm({ ...form, miktar: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white"
                  />
                </label>
                <label className="text-[10px] font-black uppercase text-slate-500 space-y-1 col-span-2">
                  Durum
                  <select
                    value={form.onayDurumu}
                    onChange={(e) => setForm({ ...form, onayDurumu: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white"
                  >
                    {form.onayDurumu &&
                    ![
                      'ONAYLANDI',
                      'ONAY BEKLİYOR',
                      'DİJİTAL ONAYLANDI',
                      '1. ONAY TAMAMLANDI',
                      '2. ONAY TAMAMLANDI',
                      'FARK VAR — YÖNETİCİ BİLDİRİLDİ',
                    ].includes(form.onayDurumu) ? (
                      <option value={form.onayDurumu}>{form.onayDurumu}</option>
                    ) : null}
                    <option value="ONAYLANDI">ONAYLANDI</option>
                    <option value="ONAY BEKLİYOR">ONAY BEKLİYOR</option>
                    <option value="DİJİTAL ONAYLANDI">DİJİTAL ONAYLANDI</option>
                    <option value="1. ONAY TAMAMLANDI">1. ONAY TAMAMLANDI</option>
                    <option value="2. ONAY TAMAMLANDI">2. ONAY TAMAMLANDI</option>
                    <option value="FARK VAR — YÖNETİCİ BİLDİRİLDİ">FARK VAR — YÖNETİCİ BİLDİRİLDİ</option>
                  </select>
                </label>
              </>
            )}
            {selected.kaynak === 'fatura' && (
              <>
                <label className="text-[10px] font-black uppercase text-slate-500 space-y-1">
                  Genel toplam (₺)
                  <input
                    value={form.tutar}
                    onChange={(e) => setForm({ ...form, tutar: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white"
                  />
                </label>
                <label className="text-[10px] font-black uppercase text-slate-500 space-y-1 col-span-3">
                  Durum
                  <select
                    value={form.onayDurumu}
                    onChange={(e) => setForm({ ...form, onayDurumu: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-sm border border-slate-300 text-[12px] font-semibold bg-white"
                  >
                    <option value="KONTROL BEKLEYOR">KONTROL BEKLEYOR</option>
                    <option value="UYUMLU">UYUMLU</option>
                    <option value="FARK VAR">FARK VAR</option>
                    <option value="ONAYLANDI">ONAYLANDI</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="border border-slate-300 rounded-sm bg-white overflow-hidden">
            <div className="px-3 py-2 bg-slate-100 flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">
                Hizmet / kalem detayı
              </p>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    kalemler: [
                      ...form.kalemler,
                      { id: `kl_${Date.now()}`, urunAdi: '', miktar: '', birim: '' },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-black bg-[#0f2744] text-white cursor-pointer"
              >
                <Plus size={12} /> Kalem ekle
              </button>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[9px] font-black uppercase text-slate-500">
                  <th className="px-2 py-1">Hizmet / malzeme</th>
                  <th className="px-2 py-1 w-28">Miktar</th>
                  <th className="px-2 py-1 w-24">Birim</th>
                  <th className="px-2 py-1 w-10" />
                </tr>
              </thead>
              <tbody>
                {form.kalemler.map((k, idx) => (
                  <tr key={k.id} className="border-t border-slate-100">
                    <td className="px-2 py-1">
                      <input
                        value={k.urunAdi}
                        onChange={(e) => {
                          const next = [...form.kalemler];
                          next[idx] = { ...k, urunAdi: e.target.value };
                          setForm({ ...form, kalemler: next });
                        }}
                        placeholder="Örn. Vidanjör çekim, mıcır, içme suyu"
                        className="w-full px-2 py-1 rounded-sm border border-slate-200 text-[12px] font-semibold"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={k.miktar}
                        onChange={(e) => {
                          const next = [...form.kalemler];
                          next[idx] = { ...k, miktar: e.target.value };
                          setForm({ ...form, kalemler: next });
                        }}
                        className="w-full px-2 py-1 rounded-sm border border-slate-200 text-[12px] font-semibold"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={k.birim}
                        onChange={(e) => {
                          const next = [...form.kalemler];
                          next[idx] = { ...k, birim: e.target.value };
                          setForm({ ...form, kalemler: next });
                        }}
                        placeholder="ton / çekim / adet"
                        className="w-full px-2 py-1 rounded-sm border border-slate-200 text-[12px] font-semibold"
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            kalemler:
                              form.kalemler.length <= 1
                                ? [{ id: `kl_${Date.now()}`, urunAdi: '', miktar: '', birim: '' }]
                                : form.kalemler.filter((_, i) => i !== idx),
                          })
                        }
                        className="p-1 rounded-sm text-rose-700 cursor-pointer"
                        title="Kalemi sil"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-[11px] font-black bg-[#0f2744] text-white cursor-pointer disabled:opacity-50"
            >
              <Save size={13} /> {busy ? 'Kaydediliyor…' : 'Deftere kaydet'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete(selected)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-[11px] font-black bg-rose-800 text-white cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={13} /> Evrakı sil
            </button>
          </div>
        </div>
      )}
    </EvrakPageShell>
  );
};
