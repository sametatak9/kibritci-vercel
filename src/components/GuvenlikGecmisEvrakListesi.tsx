import React, { useMemo, useState } from 'react';
import { History, Pencil, Search, Trash2 } from 'lucide-react';
import { formatDateLabelTr, normalizeDateKey, todayDateKey } from '../lib/dateKeyUtils';
import { formatEvrakGonderimLabel, pickPrimaryFotoUrl } from '../lib/guvenlikEvrakFotolar';
import { resolveGuvenlikEvrakProvenance } from '../lib/evrakProvenance';
import { formatKapiMatchLabel } from '../lib/kapiIrsaliyeUtils';
import { openBase64InNewTab } from '../lib/fileViewerUtils';

const PAGE_SIZE = 50;

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function evrakDateKey(e: any): string {
  return normalizeDateKey(e?.tarih || e?.islemTarihi || e?.kayitZamani || '');
}

type Props = {
  evraklar: any[];
  onEdit: (evrak: any) => void;
  onDelete: (evrakId: string) => void;
  deletingId?: string | null;
};

export const GuvenlikGecmisEvrakListesi: React.FC<Props> = ({
  evraklar,
  onEdit,
  onDelete,
  deletingId = null,
}) => {
  const bugun = todayDateKey();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<'HEPSİ' | 'FATURA' | 'İRSALİYE' | 'MAKBUZ' | 'GENEL_EVRAK'>('HEPSİ');
  const [statusFilter, setStatusFilter] = useState<'HEPSİ' | 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDİLDİ'>('HEPSİ');
  const [fromDate, setFromDate] = useState(shiftDateKey(bugun, -90));
  const [toDate, setToDate] = useState(bugun);
  const [tumKayitlar, setTumKayitlar] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const query = q.trim().toLocaleLowerCase('tr-TR');
    const rows = [...(evraklar || [])]
      .filter((e) => {
        const key = evrakDateKey(e);
        if (!tumKayitlar) {
          if (fromDate && key && key < fromDate) return false;
          if (toDate && key && key > toDate) return false;
          if (!key && fromDate) return false;
        }
        if (typeFilter !== 'HEPSİ' && e.evrakTuru !== typeFilter) return false;
        if (statusFilter !== 'HEPSİ' && e.durum !== statusFilter) return false;
        if (!query) return true;
        const hay = `${e.fileName || ''} ${e.aciklama || ''} ${e.evrakNo || ''} ${e.firma || ''} ${e.kaydeden || ''} ${e.id || ''}`
          .toLocaleLowerCase('tr-TR');
        return hay.includes(query);
      })
      .sort((a, b) => {
        const za = String(a.kayitZamani || a.duzeltmeZamani || '');
        const zb = String(b.kayitZamani || b.duzeltmeZamani || '');
        if (za && zb) return zb.localeCompare(za);
        return evrakDateKey(b).localeCompare(evrakDateKey(a));
      });
    return rows;
  }, [evraklar, q, typeFilter, statusFilter, fromDate, toDate, tumKayitlar]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <History size={14} className="text-amber-600" />
              Geçmiş Evrak Listesi
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xl leading-snug">
              Kapıdan girilen tüm evraklar burada durur. Satırdan <strong>Düzenle</strong> → bilgileri düzeltip{' '}
              <strong>Kaydet</strong>, veya <strong>Sil</strong>. Fotoğraf yeniden yazılmaz; kayıt bozulmaz.
            </p>
          </div>
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
            {filtered.length} kayıt
          </span>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="space-y-1">
            <span className="text-[8px] font-black uppercase text-slate-400 block">Başlangıç</span>
            <input
              type="date"
              disabled={tumKayitlar}
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold disabled:opacity-50"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[8px] font-black uppercase text-slate-400 block">Bitiş</span>
            <input
              type="date"
              disabled={tumKayitlar}
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 pb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={tumKayitlar}
              onChange={(e) => {
                setTumKayitlar(e.target.checked);
                setPage(0);
              }}
            />
            Tüm kayıtlar
          </label>
          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Firma, evrak no, dosya, açıklama…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-7 pr-2 text-xs font-bold"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as any);
              setPage(0);
            }}
            className="border border-slate-200 py-1.5 px-2 rounded-xl text-xs bg-white font-bold"
          >
            <option value="HEPSİ">Tüm türler</option>
            <option value="İRSALİYE">İrsaliye</option>
            <option value="FATURA">Fatura</option>
            <option value="MAKBUZ">Makbuz</option>
            <option value="GENEL_EVRAK">Genel evrak</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(0);
            }}
            className="border border-slate-200 py-1.5 px-2 rounded-xl text-xs bg-white font-bold"
          >
            <option value="HEPSİ">Tüm durumlar</option>
            <option value="BEKLEMEDE">Beklemede</option>
            <option value="ONAYLANDI">Onaylandı</option>
            <option value="REDDEDİLDİ">Reddedildi</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {pageRows.length === 0 ? (
          <div className="text-center py-12 text-[11px] text-slate-400 font-bold">
            Bu aralığa uyan kapı evrakı yok. Tarihi genişletin veya «Tüm kayıtlar»ı açın.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                  <th className="p-3">Tarih</th>
                  <th className="p-3">Evrak / Dosya</th>
                  <th className="p-3">Tür</th>
                  <th className="p-3">Firma</th>
                  <th className="p-3">No</th>
                  <th className="p-3">Durum</th>
                  <th className="p-3 text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((e) => {
                  const foto = pickPrimaryFotoUrl(e);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{formatDateLabelTr(evrakDateKey(e))}</div>
                        <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                          {formatEvrakGonderimLabel(e)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800 truncate max-w-[180px]">{e.fileName || 'Belge'}</div>
                        <div className="text-[9px] text-slate-400 truncate max-w-[180px]" title={e.aciklama}>
                          {e.aciklama || '—'}
                        </div>
                        {foto ? (
                          <button
                            type="button"
                            onClick={() => openBase64InNewTab(foto, e.fileName || 'Belge')}
                            className="text-[9px] text-indigo-600 hover:underline font-bold mt-0.5 cursor-pointer"
                          >
                            Evrakı görüntüle
                          </button>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                            e.evrakTuru === 'FATURA'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : e.evrakTuru === 'İRSALİYE'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : e.evrakTuru === 'MAKBUZ'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {e.evrakTuru || '—'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800 truncate max-w-[160px]">{e.firma || '—'}</div>
                        {e.matchSummary ? (
                          <span className="text-[8px] text-slate-500 font-semibold">
                            {formatKapiMatchLabel(e.matchSummary)}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-600">{e.evrakNo || '—'}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full ${
                              e.durum === 'ONAYLANDI'
                                ? 'bg-emerald-100 text-emerald-800'
                                : e.durum === 'REDDEDİLDİ'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {e.durum || 'BEKLEMEDE'}
                          </span>
                          {resolveGuvenlikEvrakProvenance(e).map((b) => (
                            <span key={b.label} className={b.className} title={b.title}>
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-center items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEdit(e)}
                            className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer"
                          >
                            <Pencil size={11} /> Düzenle
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === e.id}
                            onClick={() => onDelete(e.id)}
                            className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 size={11} /> {deletingId === e.id ? 'Siliniyor…' : 'Sil'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-[10px] font-bold text-slate-500">
            <span>
              Sayfa {safePage + 1} / {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
