import React, { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { normalizeMicirMalzemeTipi } from '../lib/micirUtils';

export type GuvenlikDuzenleKind = 'personel' | 'arac' | 'tanker' | 'ziyaretci';

type Props = {
  kind: GuvenlikDuzenleKind;
  record: any;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  tankerLabel?: string;
};

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase block">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-indigo-400';

export const GuvenlikKayitDuzenleModal: React.FC<Props> = ({
  kind,
  record,
  onClose,
  onSave,
  tankerLabel = 'Tanker',
}) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (kind === 'personel') {
      setForm({
        tip: record.tip || 'GİRİŞ',
        zaman: toDatetimeLocalValue(record.zaman),
        islemTarihi: record.islemTarihi || String(record.zaman || '').slice(0, 10),
      });
    } else if (kind === 'arac') {
      setForm({
        plaka: record.plaka || '',
        aracTipi: record.aracTipi || '',
        firma: record.firma || '',
        yukDurumu: record.yukDurumu || 'Dolu',
        surucuAdi: record.surucuAdi || '',
        aciklama: record.aciklama || '',
        durum: record.durum || 'İÇERİDE',
        girisZamani: toDatetimeLocalValue(record.girisZamani),
        cikisZamani: toDatetimeLocalValue(record.cikisZamani),
        islemTarihi: record.islemTarihi || String(record.girisZamani || '').slice(0, 10),
      });
    } else if (kind === 'tanker') {
      const isMicir = record.tip === 'MICIR_STABILIZE';
      const kiloFromRecord =
        record.kiloKg != null && Number(record.kiloKg) > 0
          ? String(record.kiloKg)
          : record.tonaj != null && Number(record.tonaj) > 0
            ? String(Math.round(Number(record.tonaj) * 1000))
            : '';
      setForm({
        plaka: record.plaka || '',
        firma: isMicir ? 'Ento Maden' : record.firma || '',
        surucuAdi: record.surucuAdi || '',
        miktar: record.miktar || '',
        irsaliyeNo: record.irsaliyeNo || '',
        kiloKg: kiloFromRecord,
        malzemeTipi: normalizeMicirMalzemeTipi(record.malzemeTipi),
        aciklama: record.aciklama || '',
        durum: record.durum || 'İÇERİDE',
        girisZamani: toDatetimeLocalValue(record.girisZamani),
        cikisZamani: toDatetimeLocalValue(record.cikisZamani),
        islemTarihi: record.islemTarihi || String(record.girisZamani || '').slice(0, 10),
      });
    } else {
      setForm({
        adSoyad: record.adSoyad || '',
        tcNo: record.tcNo || '',
        firma: record.firma || '',
        ziyaretSebebi: record.ziyaretSebebi || '',
        ziyaretEdilen: record.ziyaretEdilen || '',
        kartNo: record.kartNo || '',
        durum: record.durum || 'İÇERİDE',
        girisZamani: toDatetimeLocalValue(record.girisZamani),
        cikisZamani: toDatetimeLocalValue(record.cikisZamani),
        islemTarihi: record.islemTarihi || String(record.girisZamani || '').slice(0, 10),
      });
    }
  }, [kind, record]);

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const title =
    kind === 'personel'
      ? 'Personel Kapı Kaydı'
      : kind === 'arac'
        ? 'Araç Kaydı'
        : kind === 'tanker'
          ? `${tankerLabel} Kaydı`
          : 'Ziyaretçi Kaydı';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let patch: Record<string, unknown> = {};

      if (kind === 'personel') {
        const zaman = fromDatetimeLocalValue(form.zaman);
        if (!zaman) throw new Error('Geçerli bir saat seçin.');
        patch = {
          tip: form.tip,
          zaman,
          islemTarihi: form.islemTarihi || zaman.slice(0, 10),
          duzeltmeZamani: new Date().toISOString(),
        };
      } else if (kind === 'arac' || kind === 'tanker') {
        const girisZamani = fromDatetimeLocalValue(form.girisZamani);
        if (!girisZamani) throw new Error('Giriş saati zorunlu.');
        const cikisZamani =
          form.durum === 'ÇIKTI' ? fromDatetimeLocalValue(form.cikisZamani) || new Date().toISOString() : null;
        patch = {
          plaka: form.plaka.trim().toUpperCase(),
          firma: form.firma.trim(),
          surucuAdi: form.surucuAdi.trim(),
          aciklama: form.aciklama.trim(),
          durum: form.durum,
          girisZamani,
          cikisZamani,
          islemTarihi: form.islemTarihi || girisZamani.slice(0, 10),
          duzeltmeZamani: new Date().toISOString(),
        };
        if (kind === 'arac') {
          patch.aracTipi = form.aracTipi.trim();
          patch.yukDurumu = form.yukDurumu;
        } else if (record.tip === 'MICIR_STABILIZE') {
          const kiloKg = Number(String(form.kiloKg || '').replace(',', '.'));
          if (!form.irsaliyeNo?.trim()) throw new Error('İrsaliye no zorunlu.');
          if (!Number.isFinite(kiloKg) || kiloKg <= 0) throw new Error('Kilo zorunlu.');
          const tonaj = Math.round((kiloKg / 1000) * 1000) / 1000;
          patch.firma = 'Ento Maden';
          patch.irsaliyeNo = form.irsaliyeNo.trim().toUpperCase();
          patch.kiloKg = kiloKg;
          patch.tonaj = tonaj;
          patch.malzemeTipi = normalizeMicirMalzemeTipi(form.malzemeTipi);
          patch.miktar = `${kiloKg.toLocaleString('tr-TR')} kg (${tonaj.toLocaleString('tr-TR')} ton)`;
        } else {
          patch.miktar = form.miktar.trim() || 'Belirtilmedi';
        }
        if (!form.plaka.trim() || !form.firma.trim()) {
          throw new Error('Plaka ve firma zorunlu.');
        }
      } else {
        const girisZamani = fromDatetimeLocalValue(form.girisZamani);
        if (!girisZamani) throw new Error('Giriş saati zorunlu.');
        if (!form.adSoyad.trim()) throw new Error('Ad soyad zorunlu.');
        const cikisZamani =
          form.durum === 'ÇIKTI' ? fromDatetimeLocalValue(form.cikisZamani) || new Date().toISOString() : null;
        patch = {
          adSoyad: form.adSoyad.trim(),
          tcNo: form.tcNo.trim(),
          firma: form.firma.trim(),
          ziyaretSebebi: form.ziyaretSebebi.trim(),
          ziyaretEdilen: form.ziyaretEdilen.trim(),
          kartNo: form.kartNo.trim(),
          durum: form.durum,
          girisZamani,
          cikisZamani,
          islemTarihi: form.islemTarihi || girisZamani.slice(0, 10),
          duzeltmeZamani: new Date().toISOString(),
        };
      }

      await onSave(patch);
    } catch (err: any) {
      alert(err?.message || 'Güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h3 className="font-display font-black text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Pencil size={14} className="text-indigo-600" />
            {title} Düzenle
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {kind === 'personel' && (
          <p className="text-[11px] text-slate-500">
            {record.ad} {record.soyad} · {record.gorev || '—'}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {kind === 'personel' && (
            <>
              <Field label="Tip">
                <select value={form.tip || ''} onChange={(e) => set('tip', e.target.value)} className={inputClass}>
                  <option value="GİRİŞ">GİRİŞ</option>
                  <option value="ÇIKIŞ">ÇIKIŞ</option>
                </select>
              </Field>
              <Field label="İşlem Tarihi">
                <input
                  type="date"
                  required
                  value={form.islemTarihi || ''}
                  onChange={(e) => set('islemTarihi', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Saat">
                <input
                  type="datetime-local"
                  required
                  value={form.zaman || ''}
                  onChange={(e) => set('zaman', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </>
          )}

          {(kind === 'arac' || kind === 'tanker') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Plaka">
                  <input
                    required
                    value={form.plaka || ''}
                    onChange={(e) => set('plaka', e.target.value)}
                    className={`${inputClass} font-mono uppercase`}
                  />
                </Field>
                <Field label="Firma">
                  <input
                    required
                    value={form.firma || ''}
                    onChange={(e) => set('firma', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              {kind === 'arac' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Araç Tipi">
                    <input
                      value={form.aracTipi || ''}
                      onChange={(e) => set('aracTipi', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Yük Durumu">
                    <select
                      value={form.yukDurumu || 'Dolu'}
                      onChange={(e) => set('yukDurumu', e.target.value)}
                      className={inputClass}
                    >
                      <option value="Dolu">Dolu</option>
                      <option value="Boş">Boş</option>
                      <option value="Yarım">Yarım</option>
                    </select>
                  </Field>
                </div>
              ) : record.tip === 'MICIR_STABILIZE' ? (
                <>
                  <Field label="İrsaliye No *">
                    <input
                      required
                      value={form.irsaliyeNo || ''}
                      onChange={(e) => set('irsaliyeNo', e.target.value)}
                      className={`${inputClass} font-mono uppercase`}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Kilo (kg) *">
                      <input
                        required
                        type="number"
                        min={1}
                        step={1}
                        value={form.kiloKg || ''}
                        onChange={(e) => set('kiloKg', e.target.value)}
                        className={inputClass}
                        placeholder="örn. 25500"
                      />
                    </Field>
                    <Field label="Malzeme">
                      <select
                        value={form.malzemeTipi || 'MICIR'}
                        onChange={(e) => set('malzemeTipi', e.target.value)}
                        className={inputClass}
                      >
                        <option value="MICIR">Mıcır</option>
                        <option value="STABILIZE">Stabilize</option>
                        <option value="TAS_TOZU">Taş Tozu</option>
                      </select>
                    </Field>
                  </div>
                  <p className="text-[10px] text-emerald-700 font-semibold">
                    Cari: Ento Maden — bu kayıt bir kapı irsaliyesidir.
                  </p>
                </>
              ) : (
                <Field label="Miktar / Çekim">
                  <input
                    value={form.miktar || ''}
                    onChange={(e) => set('miktar', e.target.value)}
                    className={inputClass}
                    placeholder="örn. 12 m³ / 5000 Lt"
                  />
                </Field>
              )}
              <Field label="Sürücü">
                <input
                  value={form.surucuAdi || ''}
                  onChange={(e) => set('surucuAdi', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Açıklama">
                <input
                  value={form.aciklama || ''}
                  onChange={(e) => set('aciklama', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Durum">
                <select value={form.durum || 'İÇERİDE'} onChange={(e) => set('durum', e.target.value)} className={inputClass}>
                  <option value="İÇERİDE">İÇERİDE</option>
                  <option value="ÇIKTI">ÇIKTI</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="İşlem Tarihi">
                  <input
                    type="date"
                    required
                    value={form.islemTarihi || ''}
                    onChange={(e) => set('islemTarihi', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Giriş Saati">
                  <input
                    type="datetime-local"
                    required
                    value={form.girisZamani || ''}
                    onChange={(e) => set('girisZamani', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              {form.durum === 'ÇIKTI' && (
                <Field label="Çıkış Saati">
                  <input
                    type="datetime-local"
                    value={form.cikisZamani || ''}
                    onChange={(e) => set('cikisZamani', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              )}
            </>
          )}

          {kind === 'ziyaretci' && (
            <>
              <Field label="Ad Soyad">
                <input
                  required
                  value={form.adSoyad || ''}
                  onChange={(e) => set('adSoyad', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="TC No">
                  <input value={form.tcNo || ''} onChange={(e) => set('tcNo', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Kart No">
                  <input
                    value={form.kartNo || ''}
                    onChange={(e) => set('kartNo', e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>
              <Field label="Firma">
                <input value={form.firma || ''} onChange={(e) => set('firma', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Ziyaret Sebebi">
                <input
                  value={form.ziyaretSebebi || ''}
                  onChange={(e) => set('ziyaretSebebi', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Görüşülen">
                <input
                  value={form.ziyaretEdilen || ''}
                  onChange={(e) => set('ziyaretEdilen', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Durum">
                <select value={form.durum || 'İÇERİDE'} onChange={(e) => set('durum', e.target.value)} className={inputClass}>
                  <option value="İÇERİDE">İÇERİDE</option>
                  <option value="ÇIKTI">ÇIKTI</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="İşlem Tarihi">
                  <input
                    type="date"
                    required
                    value={form.islemTarihi || ''}
                    onChange={(e) => set('islemTarihi', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Giriş Saati">
                  <input
                    type="datetime-local"
                    required
                    value={form.girisZamani || ''}
                    onChange={(e) => set('girisZamani', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              {form.durum === 'ÇIKTI' && (
                <Field label="Çıkış Saati">
                  <input
                    type="datetime-local"
                    value={form.cikisZamani || ''}
                    onChange={(e) => set('cikisZamani', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl transition cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold px-5 py-2 rounded-xl transition cursor-pointer"
            >
              {saving ? 'Kaydediliyor...' : 'Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
