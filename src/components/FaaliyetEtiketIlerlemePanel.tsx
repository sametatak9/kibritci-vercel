import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquarePlus,
  PlayCircle,
  Tag,
  X,
} from 'lucide-react';
import {
  FaaliyetIlerlemeDurumu,
  FaaliyetIlerlemeKaydi,
  SahaFaaliyeti,
} from '../types/erp';
import {
  etiketOptionsWithCustom,
  FAALIYET_ASAMA_ONSETLERI,
  FAALIYET_ETIKET_ONSETLERI,
  FaaliyetAsamaAnahtari,
  faaliyetAsamaLabel,
  ilerlemeDurumuLabel,
  normalizeFaaliyetEtiketi,
} from '../lib/faaliyetEtiketUtils';
import { compressImage } from '../lib/imageCompress';

interface FaaliyetEtiketIlerlemePanelProps {
  faaliyet: SahaFaaliyeti;
  currentUserEmail?: string;
  busy?: boolean;
  onPatch: (patch: Partial<SahaFaaliyeti>) => Promise<void> | void;
  compact?: boolean;
  /** Üst ekranın lightbox'ına bağla (yoksa panel kendi büyütmesini açar) */
  onOpenFoto?: (urls: string[], index: number) => void;
}

const ASAMA_STYLE: Record<
  FaaliyetAsamaAnahtari,
  { chip: string; rail: string; Icon: typeof PlayCircle }
> = {
  BASLANGIC: {
    chip: 'bg-sky-100 text-sky-900 border-sky-200',
    rail: 'bg-sky-500',
    Icon: PlayCircle,
  },
  ILERLEME: {
    chip: 'bg-amber-100 text-amber-950 border-amber-200',
    rail: 'bg-amber-500',
    Icon: Circle,
  },
  BITIS: {
    chip: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    rail: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
};

function formatIlerlemeZaman(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const FaaliyetEtiketIlerlemePanel: React.FC<FaaliyetEtiketIlerlemePanelProps> = ({
  faaliyet,
  currentUserEmail,
  busy = false,
  onPatch,
  compact = false,
  onOpenFoto,
}) => {
  const [yorum, setYorum] = useState('');
  const [fotoDrafts, setFotoDrafts] = useState<string[]>([]);
  const [asamaDraft, setAsamaDraft] = useState<FaaliyetAsamaAnahtari | ''>('');
  const [saving, setSaving] = useState(false);
  const [customEtiket, setCustomEtiket] = useState('');
  const [localLightbox, setLocalLightbox] = useState<{ urls: string[]; index: number } | null>(
    null
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const etiket = normalizeFaaliyetEtiketi(faaliyet.isEtiketi);
  const durum = (faaliyet.ilerlemeDurumu || 'BASLAMADI') as FaaliyetIlerlemeDurumu;
  const kayitlar = faaliyet.ilerlemeKayitlari || [];

  const timeline = useMemo(
    () =>
      kayitlar
        .slice()
        .sort((a, b) => String(a.tarih || '').localeCompare(String(b.tarih || ''))),
    [kayitlar]
  );

  const asamaOzet = useMemo(() => {
    const set = new Set<FaaliyetAsamaAnahtari>();
    for (const k of kayitlar) {
      const a = k.asama;
      if (a === 'BASLANGIC' || a === 'ILERLEME' || a === 'BITIS') set.add(a);
    }
    return set;
  }, [kayitlar]);

  const patch = async (p: Partial<SahaFaaliyeti>) => {
    setSaving(true);
    try {
      await onPatch(p);
    } finally {
      setSaving(false);
    }
  };

  const handleEtiket = async (value: string) => {
    const next = normalizeFaaliyetEtiketi(value);
    await patch({ isEtiketi: next || undefined });
  };

  const handleDurum = async (value: FaaliyetIlerlemeDurumu) => {
    await patch({ ilerlemeDurumu: value });
  };

  const openFoto = (urls: string[], index: number) => {
    if (!urls.length) return;
    if (onOpenFoto) {
      onOpenFoto(urls, index);
      return;
    }
    setLocalLightbox({ urls, index: Math.max(0, Math.min(index, urls.length - 1)) });
  };

  const handleFotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    e.target.value = '';
    if (!files.length) return;
    const outs: string[] = [];
    for (const file of files) {
      try {
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(String(ev.target?.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(file as File);
        });
        outs.push(await compressImage(rawBase64));
      } catch {
        /* skip */
      }
    }
    setFotoDrafts((prev) => [...prev, ...outs].slice(0, 5));
  };

  const handleIlerlemeEkle = async () => {
    const text = yorum.trim();
    if (!text && fotoDrafts.length === 0) {
      alert('İlerleme için yorum veya fotoğraf girin.');
      return;
    }
    const asamaLabel = asamaDraft ? faaliyetAsamaLabel(asamaDraft) : '';
    const kayit: FaaliyetIlerlemeKaydi = {
      id: `ilr_${Date.now()}`,
      tarih: new Date().toISOString(),
      yorum:
        text ||
        (fotoDrafts.length
          ? asamaLabel
            ? `${asamaLabel} fotoğrafı`
            : 'Fotoğraflı ilerleme'
          : ''),
      fotoUrls: fotoDrafts.length ? fotoDrafts : undefined,
      yazar: currentUserEmail,
      yazarRol: 'YONETICI',
      asama: asamaDraft || undefined,
    };
    let nextDurum: FaaliyetIlerlemeDurumu = durum;
    if (asamaDraft === 'BITIS') nextDurum = 'TAMAMLANDI';
    else if (durum === 'BASLAMADI') nextDurum = 'DEVAM';
    await patch({
      ilerlemeKayitlari: [...kayitlar, kayit],
      ilerlemeDurumu: nextDurum,
    });
    setYorum('');
    setFotoDrafts([]);
    setAsamaDraft('');
  };

  const disabled = busy || saving;

  return (
    <div
      className={`rounded-xl border border-amber-200/80 bg-amber-50/40 space-y-3 ${
        compact ? 'p-2.5' : 'p-3.5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag size={12} className="text-amber-700 shrink-0" />
        <span className="text-[9px] font-black uppercase tracking-wider text-amber-900">
          İş etiketi / aşamalı ilerleme
        </span>
        {etiket ? (
          <span className="text-[9px] font-black bg-amber-600 text-white px-2 py-0.5 rounded-full">
            {etiket}
          </span>
        ) : (
          <span className="text-[9px] font-bold text-slate-400">Etiketsiz</span>
        )}
        <span className="text-[9px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
          {ilerlemeDurumuLabel(durum)}
        </span>
      </div>

      {/* Esnek aşama özeti — zorunlu değil, dolu olanlar işaretlenir */}
      <div className="grid grid-cols-3 gap-1.5">
        {FAALIYET_ASAMA_ONSETLERI.map(({ key, label, hint }) => {
          const filled = asamaOzet.has(key);
          const { chip, Icon } = ASAMA_STYLE[key];
          return (
            <div
              key={key}
              className={`rounded-lg border px-2 py-1.5 ${
                filled ? chip : 'bg-white/70 border-slate-200 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-1">
                <Icon size={12} className={filled ? '' : 'opacity-40'} />
                <span className="text-[9px] font-black uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-[8px] mt-0.5 opacity-80 leading-tight">{hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[8px] font-black uppercase text-slate-500 block mb-1">
            Etiket
          </label>
          <select
            value={etiket}
            disabled={disabled}
            onChange={(e) => void handleEtiket(e.target.value)}
            className="w-full text-[10px] font-bold p-2 bg-white border border-slate-200 rounded-lg outline-none disabled:opacity-50"
          >
            <option value="">— Seç —</option>
            {etiketOptionsWithCustom(etiket).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <div className="flex gap-1 mt-1">
            <input
              value={customEtiket}
              onChange={(e) => setCustomEtiket(e.target.value)}
              placeholder="Serbest etiket…"
              disabled={disabled}
              className="flex-1 text-[10px] p-1.5 bg-white border border-slate-200 rounded-lg outline-none"
            />
            <button
              type="button"
              disabled={disabled || !customEtiket.trim()}
              onClick={() => {
                void handleEtiket(customEtiket);
                setCustomEtiket('');
              }}
              className="text-[9px] font-black px-2 py-1 rounded-lg bg-slate-800 text-white disabled:opacity-40 cursor-pointer"
            >
              Ekle
            </button>
          </div>
        </div>
        <div>
          <label className="text-[8px] font-black uppercase text-slate-500 block mb-1">
            Genel durum
          </label>
          <div className="flex flex-wrap gap-1">
            {(['BASLAMADI', 'DEVAM', 'TAMAMLANDI'] as FaaliyetIlerlemeDurumu[]).map((d) => (
              <button
                key={d}
                type="button"
                disabled={disabled}
                onClick={() => void handleDurum(d)}
                className={`text-[9px] font-black px-2 py-1.5 rounded-lg border cursor-pointer transition ${
                  durum === d
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                } disabled:opacity-40`}
              >
                {ilerlemeDurumuLabel(d)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {FAALIYET_ETIKET_ONSETLERI.map((o) => (
              <button
                key={o}
                type="button"
                disabled={disabled}
                onClick={() => void handleEtiket(o)}
                className={`text-[8px] font-bold px-1.5 py-0.5 rounded border cursor-pointer ${
                  etiket === o
                    ? 'bg-amber-200 border-amber-400 text-amber-950'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-amber-50'
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Zaman çizelgesi — büyük foto + not */}
      {timeline.length > 0 && (
        <div className="space-y-0 max-h-[420px] overflow-y-auto pr-0.5">
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-500 mb-2">
            Aşama kayıtları ({timeline.length})
          </p>
          <ol className="relative space-y-3 border-l-2 border-slate-200 ml-2.5 pl-4">
            {timeline.map((k) => {
              const asama = k.asama;
              const style = asama ? ASAMA_STYLE[asama] : null;
              const fotolar = k.fotoUrls || [];
              return (
                <li key={k.id} className="relative">
                  <span
                    className={`absolute -left-[1.4rem] top-2 w-2.5 h-2.5 rounded-full border-2 border-white shadow ${
                      style?.rail || 'bg-slate-400'
                    }`}
                  />
                  <article className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {asama && style ? (
                          <span
                            className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${style.chip}`}
                          >
                            {faaliyetAsamaLabel(asama)}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            Not
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-600 tabular-nums">
                          {formatIlerlemeZaman(k.tarih)}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-semibold truncate max-w-[140px]">
                        {k.yazar || '—'}
                      </span>
                    </div>
                    {k.yorum ? (
                      <p className="px-3 py-2 text-[12px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {k.yorum}
                      </p>
                    ) : null}
                    {fotolar.length > 0 && (
                      <div
                        className={`grid gap-1.5 p-2 ${
                          fotolar.length === 1
                            ? 'grid-cols-1'
                            : fotolar.length === 2
                              ? 'grid-cols-2'
                              : 'grid-cols-2 sm:grid-cols-3'
                        }`}
                      >
                        {fotolar.map((u, i) => (
                          <button
                            key={`${k.id}_${i}`}
                            type="button"
                            onClick={() => openFoto(fotolar, i)}
                            className={`relative group overflow-hidden rounded-lg border border-slate-200 bg-slate-100 cursor-pointer ${
                              fotolar.length === 1 ? 'h-40 sm:h-48' : 'h-28 sm:h-32'
                            }`}
                          >
                            <img
                              src={u}
                              alt=""
                              className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2 py-1.5 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition">
                              {i + 1}/{fotolar.length} · büyüt
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-amber-300 bg-white/80 p-2.5 space-y-2">
        <p className="text-[8px] font-black uppercase text-amber-800 flex items-center gap-1">
          <MessageSquarePlus size={11} />
          Aşama / ilerleme ekle
        </p>
        <p className="text-[9px] text-slate-500 leading-snug">
          Aşama seçimi zorunlu değil — temizlik vb. işlerde başlangıç / devam / bitiş foto ayrımı için
          kullanın.
        </p>
        <div className="flex flex-wrap gap-1">
          {FAALIYET_ASAMA_ONSETLERI.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => setAsamaDraft((prev) => (prev === key ? '' : key))}
              className={`text-[9px] font-black px-2.5 py-1.5 rounded-lg border cursor-pointer transition ${
                asamaDraft === key
                  ? ASAMA_STYLE[key].chip + ' ring-1 ring-offset-1 ring-slate-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              } disabled:opacity-40`}
            >
              {label}
            </button>
          ))}
          {asamaDraft && (
            <button
              type="button"
              onClick={() => setAsamaDraft('')}
              className="text-[9px] font-bold text-slate-400 underline cursor-pointer px-1"
            >
              Aşamasız
            </button>
          )}
        </div>
        <textarea
          value={yorum}
          onChange={(e) => setYorum(e.target.value)}
          rows={2}
          disabled={disabled}
          placeholder="Kısa ilerleme yorumu…"
          className="w-full text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none resize-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 text-[9px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 cursor-pointer"
          >
            <Camera size={12} />
            Foto
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handleFotoPick(e)}
          />
          {fotoDrafts.map((u, i) => (
            <button
              key={i}
              type="button"
              title="Kaldırmak için tıkla"
              onClick={() => setFotoDrafts((p) => p.filter((_, j) => j !== i))}
              className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 cursor-pointer"
            >
              <img src={u} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
          <button
            type="button"
            disabled={disabled || (!yorum.trim() && fotoDrafts.length === 0)}
            onClick={() => void handleIlerlemeEkle()}
            className="ml-auto inline-flex items-center gap-1 text-[9px] font-black px-3.5 py-2 rounded-lg bg-amber-500 text-slate-900 disabled:opacity-40 cursor-pointer"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            Kaydet
          </button>
        </div>
      </div>

      {localLightbox && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/90 flex items-center justify-center p-4"
          onClick={() => setLocalLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            onClick={() => setLocalLightbox(null)}
          >
            <X size={18} />
          </button>
          <img
            src={localLightbox.urls[localLightbox.index]}
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default FaaliyetEtiketIlerlemePanel;
