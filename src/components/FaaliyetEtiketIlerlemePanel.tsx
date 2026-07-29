import React, { useRef, useState } from 'react';
import { Camera, Loader2, MessageSquarePlus, Tag } from 'lucide-react';
import {
  FaaliyetIlerlemeDurumu,
  FaaliyetIlerlemeKaydi,
  SahaFaaliyeti,
} from '../types/erp';
import {
  etiketOptionsWithCustom,
  FAALIYET_ETIKET_ONSETLERI,
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
}

export const FaaliyetEtiketIlerlemePanel: React.FC<FaaliyetEtiketIlerlemePanelProps> = ({
  faaliyet,
  currentUserEmail,
  busy = false,
  onPatch,
  compact = false,
}) => {
  const [yorum, setYorum] = useState('');
  const [fotoDrafts, setFotoDrafts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [customEtiket, setCustomEtiket] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const etiket = normalizeFaaliyetEtiketi(faaliyet.isEtiketi);
  const durum = (faaliyet.ilerlemeDurumu || 'BASLAMADI') as FaaliyetIlerlemeDurumu;
  const kayitlar = faaliyet.ilerlemeKayitlari || [];

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
    const kayit: FaaliyetIlerlemeKaydi = {
      id: `ilr_${Date.now()}`,
      tarih: new Date().toISOString(),
      yorum: text || (fotoDrafts.length ? 'Fotoğraflı ilerleme' : ''),
      fotoUrls: fotoDrafts.length ? fotoDrafts : undefined,
      yazar: currentUserEmail,
      yazarRol: 'YONETICI',
    };
    const nextDurum: FaaliyetIlerlemeDurumu =
      durum === 'BASLAMADI' ? 'DEVAM' : durum;
    await patch({
      ilerlemeKayitlari: [...kayitlar, kayit],
      ilerlemeDurumu: nextDurum,
    });
    setYorum('');
    setFotoDrafts([]);
  };

  const disabled = busy || saving;

  return (
    <div
      className={`rounded-xl border border-amber-200/80 bg-amber-50/40 space-y-2.5 ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag size={12} className="text-amber-700 shrink-0" />
        <span className="text-[9px] font-black uppercase tracking-wider text-amber-900">
          İş etiketi / ilerleme
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
            İlerleme durumu
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
            {FAALIYET_ETIKET_ONSETLERI.slice(0, 4).map((o) => (
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

      {kayitlar.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {kayitlar
            .slice()
            .reverse()
            .map((k) => (
              <div
                key={k.id}
                className="rounded-lg bg-white border border-slate-100 px-2.5 py-1.5 text-[10px]"
              >
                <div className="flex justify-between gap-2 text-[8px] text-slate-400 font-bold">
                  <span>{new Date(k.tarih).toLocaleString('tr-TR')}</span>
                  <span>{k.yazar || '—'}</span>
                </div>
                <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{k.yorum}</p>
                {(k.fotoUrls || []).length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {(k.fotoUrls || []).slice(0, 4).map((u, i) => (
                      <img
                        key={`${k.id}_${i}`}
                        src={u}
                        alt=""
                        className="w-10 h-10 rounded object-cover border border-slate-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-amber-300 bg-white/70 p-2 space-y-1.5">
        <p className="text-[8px] font-black uppercase text-amber-800 flex items-center gap-1">
          <MessageSquarePlus size={11} />
          İlerleme ekle
        </p>
        <textarea
          value={yorum}
          onChange={(e) => setYorum(e.target.value)}
          rows={2}
          disabled={disabled}
          placeholder="Kısa ilerleme yorumu…"
          className="w-full text-[10px] p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none resize-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 cursor-pointer"
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
            <img
              key={i}
              src={u}
              alt=""
              className="w-9 h-9 rounded object-cover border"
              onClick={() => setFotoDrafts((p) => p.filter((_, j) => j !== i))}
              title="Kaldırmak için tıkla"
            />
          ))}
          <button
            type="button"
            disabled={disabled || (!yorum.trim() && fotoDrafts.length === 0)}
            onClick={() => void handleIlerlemeEkle()}
            className="ml-auto inline-flex items-center gap-1 text-[9px] font-black px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 disabled:opacity-40 cursor-pointer"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaaliyetEtiketIlerlemePanel;
