import React, { useMemo, useState } from 'react';
import { Images, Search, ZoomIn, FileText, Check, X, Loader2 } from 'lucide-react';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import { EmptyState } from './EmptyState';

export type EvrakDuvariSourceType = 'gelenEvrak' | 'micirFis' | 'tanker';

export type EvrakDuvariItem = {
  id: string;
  src: string;
  title: string;
  meta?: string;
  kategori?: string;
  /** Gönderilme / kayıt zamanı (görüntüleme) */
  tarih?: string;
  /** BEKLEMEDE | YONETICI_ONAYINDA | ONAYLANDI | REDDEDİLDİ | … */
  durum?: string;
  sourceType?: EvrakDuvariSourceType;
  sourceId?: string;
  /** Onay/red bu duvardan yapılabilir mi (kaynak tipine göre) */
  actionable?: boolean;
};

type DurumFilter = 'HEPSI' | 'BEKLEYEN' | 'ONAYLI' | 'REDDEDILEN';

type Props = {
  items: EvrakDuvariItem[];
  /** Yönetici / güvenlik onay yetkisi */
  canApprove?: boolean;
  onApprove?: (item: EvrakDuvariItem) => void | Promise<void>;
  onReject?: (item: EvrakDuvariItem) => void | Promise<void>;
};

function isImageSrc(src: string) {
  const s = (src || '').toLowerCase();
  return (
    s.startsWith('data:image/') ||
    s.includes('.jpg') ||
    s.includes('.jpeg') ||
    s.includes('.png') ||
    s.includes('.webp') ||
    s.includes('image/')
  );
}

export function normalizeEvrakDurum(durum?: string): string {
  return String(durum || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

export function isEvrakBekleyen(durum?: string): boolean {
  const d = normalizeEvrakDurum(durum);
  if (!d) return false;
  return (
    d === 'BEKLEMEDE' ||
    d === 'YONETICI_ONAYINDA' ||
    d.includes('ONAY BEK') ||
    d.includes('YÖNETİCİ ONAY')
  );
}

export function isEvrakOnayli(durum?: string): boolean {
  return normalizeEvrakDurum(durum) === 'ONAYLANDI';
}

export function isEvrakReddedilen(durum?: string): boolean {
  const d = normalizeEvrakDurum(durum);
  return d === 'REDDEDİLDİ' || d === 'REDDEDILDI';
}

function durumBadgeClass(durum?: string): string {
  if (isEvrakOnayli(durum)) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (isEvrakReddedilen(durum)) return 'bg-rose-100 text-rose-800 border-rose-200';
  if (isEvrakBekleyen(durum)) return 'bg-amber-100 text-amber-900 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function durumLabel(durum?: string): string {
  if (isEvrakOnayli(durum)) return 'ONAYLANDI';
  if (isEvrakReddedilen(durum)) return 'REDDEDİLDİ';
  if (isEvrakBekleyen(durum)) return 'BEKLEMEDE';
  return durum || '—';
}

/** Güvenlik kapı fotoğrafları — bekleyen evraklarda onay/red */
export const EvrakDuvariPanel: React.FC<Props> = ({
  items,
  canApprove = false,
  onApprove,
  onReject,
}) => {
  const [q, setQ] = useState('');
  const [kategori, setKategori] = useState('HEPSI');
  const bekleyenCount = useMemo(
    () => items.filter((i) => isEvrakBekleyen(i.durum) && i.actionable !== false).length,
    [items]
  );
  const [durumFilter, setDurumFilter] = useState<DurumFilter>('HEPSI');
  const [busyId, setBusyId] = useState<string | null>(null);

  const kategoriler = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.kategori) set.add(i.kategori);
    });
    return ['HEPSI', ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLocaleLowerCase('tr-TR');
    return items.filter((i) => {
      if (kategori !== 'HEPSI' && i.kategori !== kategori) return false;
      if (durumFilter === 'BEKLEYEN' && !isEvrakBekleyen(i.durum)) return false;
      if (durumFilter === 'ONAYLI' && !isEvrakOnayli(i.durum)) return false;
      if (durumFilter === 'REDDEDILEN' && !isEvrakReddedilen(i.durum)) return false;
      if (!kw) return true;
      const blob = `${i.title} ${i.meta || ''} ${i.kategori || ''} ${i.tarih || ''} ${i.durum || ''}`.toLocaleLowerCase(
        'tr-TR'
      );
      return blob.includes(kw);
    });
  }, [items, q, kategori, durumFilter]);

  const runAction = async (item: EvrakDuvariItem, kind: 'approve' | 'reject') => {
    if (busyId) return;
    const fn = kind === 'approve' ? onApprove : onReject;
    if (!fn) return;
    setBusyId(item.id);
    try {
      await fn(item);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E3F2EE] text-[#0F6C5C] flex items-center justify-center shrink-0">
              <Images size={18} />
            </div>
            <div>
              <h2
                className="text-xl font-extrabold tracking-tight text-slate-900 leading-none"
                style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
              >
                Evrak Duvarı
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Kapıdan yüklenen fotoğraf ve belgeler · {filtered.length} / {items.length}
                {bekleyenCount > 0 ? ` · ${bekleyenCount} onay bekliyor` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Plaka, firma, irsaliye…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium"
              />
            </div>
            <select
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
            >
              {kategoriler.map((k) => (
                <option key={k} value={k}>
                  {k === 'HEPSI' ? 'Tüm kategoriler' : k}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: 'HEPSI', label: 'Tümü' },
              { key: 'BEKLEYEN', label: `Bekleyen${bekleyenCount ? ` (${bekleyenCount})` : ''}` },
              { key: 'ONAYLI', label: 'Onaylı' },
              { key: 'REDDEDILEN', label: 'Reddedilen' },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setDurumFilter(f.key)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                durumFilter === f.key
                  ? 'bg-[#0F6C5C] text-white border-[#0F6C5C]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {canApprove && bekleyenCount > 0 && (
          <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Bekleyen evraklarda <strong>Onayla</strong> / <strong>Reddet</strong> butonları görünür. Görsele
            tıklayınca belge büyütülür.
          </p>
        )}
        {!canApprove && bekleyenCount > 0 && (
          <p className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            {bekleyenCount} evrak yönetici onayı bekliyor. Onay yetkisi YÖNETİCİ / KURUCU rollerindedir.
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Images}
          title={durumFilter === 'BEKLEYEN' ? 'Bekleyen evrak yok' : 'Görüntülenecek evrak yok'}
          description={
            durumFilter === 'BEKLEYEN'
              ? 'Tüm kapı evrakları onaylanmış veya henüz yüklenmemiş.'
              : 'Kapıdan fotoğraflı evrak veya mıcır irsaliyesi yüklenince burada listelenir.'
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((item) => {
            const img = isImageSrc(item.src);
            const pending = isEvrakBekleyen(item.durum);
            const showActions =
              canApprove && pending && item.actionable !== false && Boolean(item.sourceId);
            const busy = busyId === item.id;

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-2xl overflow-hidden transition ${
                  pending
                    ? 'border-amber-300 shadow-sm shadow-amber-100'
                    : 'border-slate-200 hover:border-[#0F6C5C]/45 hover:shadow-md'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openBase64InNewTab(item.src, item.title)}
                  className="group relative w-full h-36 bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer text-left"
                >
                  {img ? (
                    <img
                      src={item.src}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                      <FileText size={28} />
                      <span className="text-[10px] font-bold">Belge</span>
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition bg-white/95 border border-slate-200 text-[9px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                    <ZoomIn size={11} /> Aç
                  </span>
                  {item.durum && (
                    <span
                      className={`absolute top-2 left-2 text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${durumBadgeClass(
                        item.durum
                      )}`}
                    >
                      {durumLabel(item.durum)}
                    </span>
                  )}
                </button>
                <div className="p-2.5 space-y-1.5">
                  {item.kategori && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#0F6C5C]">
                      {item.kategori}
                    </span>
                  )}
                  <p className="text-[11px] font-bold text-slate-800 truncate">{item.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">{item.meta || '—'}</p>
                  {item.tarih ? (
                    <p className="text-[9px] font-mono text-slate-600">
                      <span className="font-black uppercase tracking-wider text-slate-400">Gönderilme · </span>
                      {item.tarih}
                    </p>
                  ) : null}

                  {showActions && (
                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(item, 'approve')}
                        className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-pointer"
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Onayla
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(item, 'reject')}
                        className="flex-1 inline-flex items-center justify-center gap-1 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-pointer"
                      >
                        <X size={12} />
                        Reddet
                      </button>
                    </div>
                  )}
                  {pending && !canApprove && (
                    <p className="text-[9px] font-semibold text-amber-700">Yönetici onayı bekleniyor</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EvrakDuvariPanel;
