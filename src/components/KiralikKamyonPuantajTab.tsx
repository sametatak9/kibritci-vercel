import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle, Truck, User, XCircle, Save, RefreshCw, Printer } from 'lucide-react';
import type { AracBakim, KiralikKamyonPuantajKaydi, Personel } from '../types/erp';
import { isSoforGorev } from '../lib/yoklamaUtils';
import { todayDateKey } from '../lib/dateKeyUtils';
import { mesaiInputDisplayValue, setMesaiHoursInMap } from '../lib/sahaFaaliyetUtils';
import { openKiralikKamyonPuantajReport } from '../lib/kiralikKamyonPuantajReport';
export function isKiralikKamyonArac(a?: AracBakim | null): boolean {
  if (!a) return false;
  if (a.kiralikKamyon === true) return true;
  return a.mulkiyet === 'KIRALIK';
}

function isAktifArac(a: AracBakim): boolean {
  return a.durum === 'AKTIF' || !a.durum;
}

function isAktifPersonel(p: Personel): boolean {
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

export function kiralikKamyonPuantajDocId(aracId: string, tarih: string): string {
  return `kkp_${aracId}_${tarih}`;
}

interface KiralikKamyonPuantajTabProps {
  araclar: AracBakim[];
  personeller: Personel[];
  kayitlar: KiralikKamyonPuantajKaydi[];
  setKayitlar: React.Dispatch<React.SetStateAction<KiralikKamyonPuantajKaydi[]>>;
  currentUser?: { email?: string; displayName?: string } | null;
  addNotification?: (mesaj: string) => void;
}

type RowDraft = {
  durum: 'Geldi' | 'Yok' | 'Girilmedi';
  soforPersonelId: string;
  mesaiSaati: number | undefined;
  notlar: string;
};

export const KiralikKamyonPuantajTab: React.FC<KiralikKamyonPuantajTabProps> = ({
  araclar,
  personeller,
  kayitlar,
  setKayitlar,
  currentUser,
  addNotification,
}) => {
  const [tarih, setTarih] = useState(todayDateKey());
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [mesaiMap, setMesaiMap] = useState<Record<string, number>>({});

  const kamyonlar = useMemo(
    () =>
      araclar
        .filter((a) => isKiralikKamyonArac(a) && isAktifArac(a))
        .sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr')),
    [araclar]
  );

  const soforler = useMemo(
    () =>
      personeller
        .filter((p) => isAktifPersonel(p) && isSoforGorev(p.gorev))
        .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')),
    [personeller]
  );

  const tumPersonelSecenek = useMemo(() => {
    if (soforler.length > 0) return soforler;
    return personeller
      .filter(isAktifPersonel)
      .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));
  }, [soforler, personeller]);

  const kayitByArac = useMemo(() => {
    const map = new Map<string, KiralikKamyonPuantajKaydi>();
    for (const k of kayitlar) {
      if (k.tarih === tarih) map.set(k.aracId, k);
    }
    return map;
  }, [kayitlar, tarih]);

  const getDraft = (aracId: string): RowDraft => {
    if (drafts[aracId]) return drafts[aracId];
    const existing = kayitByArac.get(aracId);
    return {
      durum: existing?.durum || 'Girilmedi',
      soforPersonelId: existing?.soforPersonelId || '',
      mesaiSaati: existing?.mesaiSaati,
      notlar: existing?.notlar || '',
    };
  };

  const patchDraft = (aracId: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const base = prev[aracId] || getDraft(aracId);
      return { ...prev, [aracId]: { ...base, ...patch } };
    });
  };

  // Tarih değişince draft temizle; mesai map'i mevcut kayıtlardan yükle
  React.useEffect(() => {
    setDrafts({});
    const next: Record<string, number> = {};
    for (const k of kayitlar) {
      if (k.tarih === tarih && k.mesaiSaati && k.mesaiSaati > 0) {
        next[k.aracId] = k.mesaiSaati;
      }
    }
    setMesaiMap(next);
  }, [tarih, kayitlar]);

  const geldiSayisi = kamyonlar.filter((a) => getDraft(a.id).durum === 'Geldi').length;
  const yokSayisi = kamyonlar.filter((a) => getDraft(a.id).durum === 'Yok').length;

  const handleSaveAll = async () => {
    if (kamyonlar.length === 0) {
      alert('Kiralık kamyon bulunamadı.\n\nAraç Envanteri’nden mülkiyet = Kiralık (kamyon) olarak kayıt açın.');
      return;
    }
    setSaving(true);
    try {
      const kaydeden = currentUser?.email || currentUser?.displayName || 'sistem';
      const now = new Date().toISOString();
      const toUpsert: KiralikKamyonPuantajKaydi[] = [];

      for (const arac of kamyonlar) {
        const d = getDraft(arac.id);
        const mesai = mesaiMap[arac.id];
        const sofor = tumPersonelSecenek.find((p) => p.id === d.soforPersonelId);
        if (d.durum === 'Geldi' && !d.soforPersonelId) {
          alert(`${arac.plaka}: Geldi işaretlenen kamyonda şoför seçilmelidir (Personel Yönetimi).`);
          setSaving(false);
          return;
        }
        const id = kiralikKamyonPuantajDocId(arac.id, tarih);
        toUpsert.push({
          id,
          tarih,
          aracId: arac.id,
          plaka: arac.plaka,
          markaModel: arac.markaModel,
          soforPersonelId: d.soforPersonelId || undefined,
          soforAdi: sofor ? `${sofor.ad} ${sofor.soyad}`.trim() : undefined,
          durum: d.durum,
          mesaiSaati: d.durum === 'Geldi' ? mesai || 0 : 0,
          notlar: d.notlar || undefined,
          kaydeden,
          updatedAt: now,
        });
      }

      setKayitlar((prev) => {
        const withoutThese = prev.filter(
          (k) => !(k.tarih === tarih && toUpsert.some((u) => u.aracId === k.aracId))
        );
        return [...withoutThese, ...toUpsert];
      });

      setDrafts({});
      addNotification?.(
        `Kiralık kamyon puantajı kaydedildi · ${tarih} · Geldi ${geldiSayisi} · Yok ${yokSayisi}`
      );
      alert(`Puantaj kaydedildi.\n${tarih}\nGeldi: ${geldiSayisi} · Yok: ${yokSayisi}`);
    } catch (err) {
      console.error(err);
      alert('Kayıt başarısız: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const ayOzeti = useMemo(() => {
    const prefix = tarih.slice(0, 7); // YYYY-MM
    const map = new Map<string, { plaka: string; geldi: number; yok: number; mesai: number }>();
    for (const k of kayitlar) {
      if (!String(k.tarih || '').startsWith(prefix)) continue;
      const prev = map.get(k.aracId) || { plaka: k.plaka, geldi: 0, yok: 0, mesai: 0 };
      if (k.durum === 'Geldi') {
        prev.geldi += 1;
        prev.mesai += Number(k.mesaiSaati) || 0;
      }
      if (k.durum === 'Yok') prev.yok += 1;
      map.set(k.aracId, prev);
    }
    return [...map.entries()]
      .map(([aracId, v]) => ({ aracId, ...v }))
      .sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr'));
  }, [kayitlar, tarih]);

  const handlePuantajRaporla = async () => {
    const period = tarih.slice(0, 7);
    const hasData = kayitlar.some((k) => String(k.tarih || '').startsWith(period));
    if (!hasData && kamyonlar.length === 0) {
      alert('Raporlanacak kiralık kamyon / puantaj kaydı yok.');
      return;
    }
    setReporting(true);
    try {
      await openKiralikKamyonPuantajReport(kayitlar, araclar, period);
      addNotification?.(`Kiralık kamyon puantaj raporu açıldı · ${period}`);
    } catch (err) {
      console.error(err);
      alert('Rapor açılamadı: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReporting(false);
    }
  };
  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Truck size={16} className="text-teal-700" />
              Kiralık Kamyon Puantajı
            </h3>
            <p className="text-[10px] text-slate-500 mt-1 max-w-xl">
              Araç Envanteri’nden <strong>Kiralık kamyon</strong> olarak kurulan araçlar burada yoklanır.
              Şoför kaydı Personel Yönetimi’nden; araç kaydı Araç Yönetimi’nden gelir.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 uppercase">
              <Calendar size={12} />
              Tarih
              <input
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold bg-slate-50"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveAll()}
              className="inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-bold px-3 py-2 rounded-xl"
            >
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              Günü Kaydet
            </button>
            <button
              type="button"
              disabled={reporting}
              onClick={() => void handlePuantajRaporla()}
              title="Seçili ayın Kibritçi antetli puantaj evrakını açar"
              className="inline-flex items-center gap-1.5 bg-[#1e4e78] hover:bg-[#163a5c] disabled:opacity-60 text-white text-[11px] font-bold px-3 py-2 rounded-xl"
            >
              {reporting ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={12} />}
              Puantaj Raporla
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
            Kiralık kamyon: {kamyonlar.length}
          </span>
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded-lg">
            Geldi: {geldiSayisi}
          </span>
          <span className="bg-rose-50 text-rose-800 border border-rose-100 px-2.5 py-1 rounded-lg">
            Yok: {yokSayisi}
          </span>
          <span className="bg-sky-50 text-sky-800 border border-sky-100 px-2.5 py-1 rounded-lg">
            Şoför havuzu: {tumPersonelSecenek.length}
            {soforler.length === 0 ? ' (tüm aktif personel)' : ''}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {kamyonlar.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
            <Truck className="mx-auto text-amber-700" size={28} />
            <p className="text-xs font-bold text-amber-900">Kiralık kamyon tanımlı değil</p>
            <p className="text-[10px] text-amber-800 max-w-md mx-auto">
              Araç Envanteri &amp; Kayıt sekmesinde yeni araç eklerken mülkiyeti <strong>Kiralık</strong> seçin
              ve <strong>Kiralık kamyon puantajına dahil et</strong> işaretini açın.
            </p>
          </div>
        ) : (
          kamyonlar.map((arac) => {
            const d = getDraft(arac.id);
            const hrs = mesaiMap[arac.id];
            return (
              <div
                key={arac.id}
                className={`bg-white border rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                  d.durum === 'Geldi'
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : d.durum === 'Yok'
                      ? 'border-rose-200 bg-rose-50/30'
                      : 'border-slate-200'
                }`}
              >
                <div className="min-w-0 sm:w-44 shrink-0">
                  <p className="font-black text-sm text-slate-900 font-mono">{arac.plaka}</p>
                  <p className="text-[10px] text-slate-500 truncate">{arac.markaModel || '—'}</p>
                  <span className="inline-block mt-1 text-[8px] font-black uppercase bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                    Kiralık kamyon
                  </span>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => patchDraft(arac.id, { durum: 'Geldi' })}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold border ${
                        d.durum === 'Geldi'
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      <CheckCircle size={12} /> Geldi
                    </button>
                    <button
                      type="button"
                      onClick={() => patchDraft(arac.id, { durum: 'Yok' })}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold border ${
                        d.durum === 'Yok'
                          ? 'bg-rose-600 text-white border-rose-700'
                          : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      <XCircle size={12} /> Yok
                    </button>
                    <button
                      type="button"
                      onClick={() => patchDraft(arac.id, { durum: 'Girilmedi', soforPersonelId: '' })}
                      className="px-2 py-1.5 rounded-lg text-[9px] font-bold text-slate-500 border border-slate-200 hover:bg-slate-50"
                    >
                      Sıfırla
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase">
                      <User size={11} />
                      Şoför
                      <select
                        value={d.soforPersonelId}
                        onChange={(e) => patchDraft(arac.id, { soforPersonelId: e.target.value })}
                        className="ml-1 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-semibold bg-white min-w-[160px] max-w-[220px]"
                      >
                        <option value="">Seçin…</option>
                        {tumPersonelSecenek.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.ad} {p.soyad} ({p.gorev})
                          </option>
                        ))}
                      </select>
                    </label>

                    {d.durum === 'Geldi' && (
                      <label className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase">
                        Mesai (sa)
                        <input
                          type="number"
                          min={0}
                          max={14}
                          step={0.5}
                          placeholder="—"
                          value={mesaiInputDisplayValue(hrs)}
                          onChange={(e) =>
                            setMesaiMap((prev) => setMesaiHoursInMap(prev, arac.id, e.target.value))
                          }
                          className="w-16 text-center border border-slate-200 rounded-lg py-1 text-[10px] font-mono font-bold"
                        />
                      </label>
                    )}
                  </div>

                  <input
                    type="text"
                    value={d.notlar}
                    onChange={(e) => patchDraft(arac.id, { notlar: e.target.value })}
                    placeholder="Not (opsiyonel)"
                    className="w-full text-[10px] border border-slate-100 rounded-lg px-2 py-1.5 bg-slate-50"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {ayOzeti.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shrink-0">
          <h4 className="text-[10px] font-black uppercase text-slate-600 tracking-wider mb-2">
            Ay özeti ({tarih.slice(0, 7)})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold">
                  <th className="p-1.5 text-left border border-slate-100">Plaka</th>
                  <th className="p-1.5 text-center border border-slate-100">Geldi gün</th>
                  <th className="p-1.5 text-center border border-slate-100">Yok gün</th>
                  <th className="p-1.5 text-center border border-slate-100">Mesai (sa)</th>
                </tr>
              </thead>
              <tbody>
                {ayOzeti.map((r) => (
                  <tr key={r.aracId}>
                    <td className="p-1.5 border border-slate-100 font-mono font-bold">{r.plaka}</td>
                    <td className="p-1.5 border border-slate-100 text-center text-emerald-700 font-bold">
                      {r.geldi}
                    </td>
                    <td className="p-1.5 border border-slate-100 text-center text-rose-700 font-bold">
                      {r.yok}
                    </td>
                    <td className="p-1.5 border border-slate-100 text-center text-sky-800 font-bold">
                      {r.mesai.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
