import React from 'react';
import { X, Package, Truck, CreditCard, AlertTriangle, ExternalLink, FileText } from 'lucide-react';
import { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { openBase64InNewTab } from '../lib/fileViewerUtils';

export type EvrakDetayKind = 'sa' | 'irsaliye' | 'fatura';

export interface EvrakDetayPayload {
  kind: EvrakDetayKind;
  sa?: SatinAlmaTalebi;
  irsaliye?: Irsaliye;
  fatura?: Fatura;
}

interface EvrakDetayModalProps {
  open: boolean;
  payload: EvrakDetayPayload | null;
  onClose: () => void;
}

function AttachmentBlock({
  label,
  url,
  fileName,
}: {
  label: string;
  url?: string | null;
  fileName: string;
}) {
  if (!url) return null;
  const isImage =
    url.startsWith('data:image') ||
    /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url) ||
    (!url.startsWith('data:') && !url.toLowerCase().includes('pdf'));

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
        <button
          type="button"
          onClick={() => openBase64InNewTab(url, fileName)}
          className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg cursor-pointer"
        >
          <ExternalLink size={11} /> Tam boyutta aç
        </button>
      </div>
      {isImage ? (
        <button
          type="button"
          onClick={() => openBase64InNewTab(url, fileName)}
          className="w-full cursor-pointer"
        >
          <img src={url} alt={label} className="max-h-48 w-full object-contain rounded-lg border bg-slate-50" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openBase64InNewTab(url, fileName)}
          className="w-full flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-left cursor-pointer hover:bg-slate-100"
        >
          <FileText size={16} className="text-slate-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-700">PDF / belgeyi görüntüle</span>
        </button>
      )}
    </div>
  );
}

export const EvrakDetayModal: React.FC<EvrakDetayModalProps> = ({ open, payload, onClose }) => {
  if (!open || !payload) return null;

  const { kind, sa, irsaliye, fatura } = payload;

  const Icon =
    kind === 'sa' ? Package : kind === 'irsaliye' ? Truck : CreditCard;

  const title =
    kind === 'sa'
      ? `Satın Alma · ${sa?.saId}`
      : kind === 'irsaliye'
        ? `İrsaliye · ${irsaliye?.irsaliyeNo}`
        : `Fatura · ${fatura?.faturaNo}`;

  const onayBadge = (() => {
    if (kind === 'sa' && sa) {
      const ok = sa.onayDurumu === 'ONAYLANDI' || String(sa.onayDurumu || '').includes('TAMAMLANDI');
      return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {ok ? '✓ ONAYLANDI' : sa.onayDurumu}
          {(sa as { imzaliEvrakUyumsuz?: boolean }).imzaliEvrakUyumsuz && ' ⚠️'}
        </span>
      );
    }
    if (kind === 'irsaliye' && irsaliye) {
      const ok =
        irsaliye.onayDurumu === 'ONAYLANDI' ||
        irsaliye.onayDurumu === '1. ONAY TAMAMLANDI' ||
        String(irsaliye.onayDurumu || '').includes('TAMAMLANDI');
      return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {ok ? '✓ ONAYLANDI' : irsaliye.onayDurumu}
          {(irsaliye as { imzaliEvrakUyumsuz?: boolean }).imzaliEvrakUyumsuz && ' ⚠️'}
        </span>
      );
    }
    if (kind === 'fatura' && fatura) {
      const ok = fatura.durum === 'ONAYLANDI' || fatura.durum === 'DİJİTAL ONAYLANDI';
      return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {ok ? '✓ ONAYLANDI' : fatura.durum}
          {(fatura as { imzaliEvrakUyumsuz?: boolean }).imzaliEvrakUyumsuz && ' ⚠️'}
        </span>
      );
    }
    return null;
  })();

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-600" /> {title}
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <div className="flex flex-wrap gap-2 items-center">{onayBadge}</div>

          {kind === 'sa' && sa && (
            <>
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-slate-500">Talep eden</dt>
                <dd className="font-semibold">{sa.talepEden || '—'}</dd>
                <dt className="text-slate-500">Firma</dt>
                <dd>{sa.cariFirma || '—'}</dd>
                <dt className="text-slate-500">Tarih</dt>
                <dd>{sa.tarih || '—'}</dd>
                <dt className="text-slate-500">Açıklama</dt>
                <dd className="col-span-1">{sa.aciklama || '—'}</dd>
              </dl>
              <KalemTable
                rows={(sa.kalemler || []).map((k) => ({
                  urun: k.urunAdi,
                  miktar: k.miktar,
                  birim: k.birim,
                }))}
              />
            </>
          )}

          {kind === 'irsaliye' && irsaliye && (
            <>
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-slate-500">Firma</dt>
                <dd className="font-semibold">{irsaliye.firma}</dd>
                <dt className="text-slate-500">Tarih</dt>
                <dd>{irsaliye.tarih}</dd>
                <dt className="text-slate-500">PO</dt>
                <dd>{irsaliye.saId || '—'}</dd>
                <dt className="text-slate-500">Fatura</dt>
                <dd>{irsaliye.faturaNo || '—'}</dd>
                {irsaliye.plaka && (
                  <>
                    <dt className="text-slate-500">Plaka</dt>
                    <dd className="font-mono font-bold">{irsaliye.plaka}</dd>
                  </>
                )}
                {irsaliye.kaynak && (
                  <>
                    <dt className="text-slate-500">Kaynak</dt>
                    <dd>{irsaliye.kaynak}</dd>
                  </>
                )}
                {irsaliye.tonaj != null && (
                  <>
                    <dt className="text-slate-500">Tonaj</dt>
                    <dd>{irsaliye.tonaj} ton</dd>
                  </>
                )}
                {irsaliye.cekimAdedi != null && (
                  <>
                    <dt className="text-slate-500">Çekim</dt>
                    <dd>{irsaliye.cekimAdedi}</dd>
                  </>
                )}
              </dl>
              <KalemTable
                rows={(irsaliye.kalemler || []).map((k) => ({
                  urun: k.urunAdi,
                  miktar: k.miktar,
                  birim: k.birim,
                }))}
              />
              <AttachmentBlock
                label="Fiş / irsaliye görseli"
                url={irsaliye.fisEvrakUrl}
                fileName={`irsaliye_${irsaliye.irsaliyeNo || 'evrak'}.jpg`}
              />
            </>
          )}

          {kind === 'fatura' && fatura && (
            <>
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-slate-500">Cari</dt>
                <dd className="font-semibold">{fatura.cariUnvan}</dd>
                <dt className="text-slate-500">Tarih</dt>
                <dd>{fatura.tarih}</dd>
                <dt className="text-slate-500">Toplam</dt>
                <dd>{Number(fatura.genelToplam || 0).toLocaleString('tr-TR')} TL</dd>
                <dt className="text-slate-500">PO</dt>
                <dd>{fatura.saId || '—'}</dd>
              </dl>
              <KalemTable
                rows={(fatura.kalemler || []).map((k) => ({
                  urun: k.urunAdi,
                  miktar: k.miktar,
                  birim: k.birim,
                  extra: `${k.birimFiyat} TL`,
                }))}
              />
              <AttachmentBlock
                label="Fatura evrakı"
                url={fatura.evrakUrl}
                fileName={`fatura_${fatura.faturaNo || 'evrak'}.jpg`}
              />
            </>
          )}

          <AttachmentBlock
            label="İmzalı evrak"
            url={
              payload.sa?.imzaliEvrakUrl ||
              payload.irsaliye?.imzaliEvrakUrl ||
              payload.fatura?.imzaliEvrakUrl
            }
            fileName="imzali_evrak.jpg"
          />
        </div>
      </div>
    </div>
  );
};

function KalemTable({
  rows,
}: {
  rows: { urun: string; miktar: number; birim: string; extra?: string }[];
}) {
  if (!rows.length) {
    return <p className="text-slate-400 italic">Kalem yok</p>;
  }
  return (
    <table className="w-full text-[10px] border rounded-xl overflow-hidden">
      <thead>
        <tr className="bg-slate-100 text-slate-600">
          <th className="p-2 text-left">Ürün</th>
          <th className="p-2 text-right">Miktar</th>
          <th className="p-2">Birim</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="p-2 font-medium">{r.urun}</td>
            <td className="p-2 text-right">{r.miktar}</td>
            <td className="p-2 text-center">
              {r.birim}
              {r.extra && <span className="text-slate-400 ml-1">· {r.extra}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Havuz kartı için mini özet satırı */
export function EvrakMiniOzet({
  label,
  no,
  sub,
  uyumsuz,
}: {
  label: string;
  no: string;
  sub?: string;
  uyumsuz?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="font-black text-slate-400 w-8">{label}</span>
      <div>
        <span className="font-bold text-slate-800">{no}</span>
        {uyumsuz && (
          <AlertTriangle className="inline w-3 h-3 text-amber-500 ml-1" aria-label="İmza uyumsuz" />
        )}
        {sub && <p className="text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}
