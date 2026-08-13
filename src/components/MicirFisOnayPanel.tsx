import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck, Check, X, Pencil, RefreshCw, Camera, AlertTriangle, History, Search, Trash2
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { CariKart, CariKartIslem, Irsaliye, MicirStabilizeFis, SatinAlmaTalebi } from '../types/erp';
import { db } from '../lib/firebase';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import {
  ENTO_MADEN_UNVAN,
  findEntoMadenCari,
  formatMicirMiktarLabel,
  kgToTon,
  malzemeTipiLabel,
  MicirMalzemeTipi,
  normalizeMicirMalzemeTipi,
  resolveMicirKiloKg,
} from '../lib/micirUtils';
import {
  approveMicirFis,
  findMatchingMicirSatinAlma,
  isMicirFisPending,
  listMatchingMicirSatinAlma,
  rejectMicirFis,
} from '../lib/micirOnayUtils';
import { deleteMicirFisCascade, fisDurumLabel } from '../lib/fisGecmisUtils';

interface MicirFisOnayPanelProps {
  currentUser: any;
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
}

export const MicirFisOnayPanel: React.FC<MicirFisOnayPanelProps> = ({
  currentUser,
  cariKartlar,
  setCariKartlar,
  setIrsaliyeler,
  setCariIslemGecmisi,
  satinAlmaTalepleri = [],
  irsaliyeler = [],
  addNotification,
}) => {
  const [fisler, setFisler] = useState<MicirStabilizeFis[]>([]);
  const [editing, setEditing] = useState<MicirStabilizeFis | null>(null);
  const [tarih, setTarih] = useState('');
  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [plaka, setPlaka] = useState('');
  const [kiloKg, setKiloKg] = useState('');
  const [malzemeTipi, setMalzemeTipi] = useState<MicirMalzemeTipi>('MICIR');
  const [selectedSaId, setSelectedSaId] = useState('');
  const [saving, setSaving] = useState(false);
  const [listMode, setListMode] = useState<'bekleyen' | 'gecmis'>('bekleyen');
  const [gecmisArama, setGecmisArama] = useState('');

  const entoCari = useMemo(() => findEntoMadenCari(cariKartlar), [cariKartlar]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'micirStabilizeFisleri'), (snap) => {
      const list: MicirStabilizeFis[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<MicirStabilizeFis, 'id'>) }));
      list.sort((a, b) => String(b.olusturulma || '').localeCompare(String(a.olusturulma || '')));
      setFisler(list);
    });
    return () => unsub();
  }, []);

  const pending = useMemo(() => fisler.filter((f) => isMicirFisPending(f)), [fisler]);
  const gecmis = useMemo(() => fisler.filter((f) => !isMicirFisPending(f)), [fisler]);
  const filteredGecmis = useMemo(() => {
    const q = gecmisArama.trim().toLowerCase();
    if (!q) return gecmis;
    return gecmis.filter((f) =>
      [f.irsaliyeNo, f.plaka, f.tarih, f.kaydeden, f.firmaUnvan, f.malzemeTipi, f.durum]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
        .includes(q)
    );
  }, [gecmis, gecmisArama]);
  const visibleList = listMode === 'bekleyen' ? pending : filteredGecmis;
  const editingApproved = editing?.durum === 'ONAYLANDI';

  const saCandidates = useMemo(() => {
    if (!editing) return [];
    return listMatchingMicirSatinAlma(satinAlmaTalepleri, irsaliyeler, malzemeTipi, {});
  }, [editing, satinAlmaTalepleri, irsaliyeler, malzemeTipi]);

  const editingSaMatch = useMemo(() => {
    if (!editing) return null;
    if (selectedSaId) {
      return (
        findMatchingMicirSatinAlma(satinAlmaTalepleri, irsaliyeler, malzemeTipi, {
          preferredSaId: selectedSaId,
        }) || null
      );
    }
    return findMatchingMicirSatinAlma(satinAlmaTalepleri, irsaliyeler, malzemeTipi, {}) || null;
  }, [editing, selectedSaId, satinAlmaTalepleri, irsaliyeler, malzemeTipi]);

  const openEdit = (f: MicirStabilizeFis) => {
    setEditing(f);
    setTarih(f.tarih);
    setIrsaliyeNo(f.irsaliyeNo);
    setPlaka(f.plaka);
    setKiloKg(String(resolveMicirKiloKg(f) || ''));
    const tip = normalizeMicirMalzemeTipi(f.malzemeTipi);
    setMalzemeTipi(tip);
    // Kapıda eski SA yazılmış olabilir — en yeni açık SA'yı öner, eskiyi listede tut
    const best = findMatchingMicirSatinAlma(satinAlmaTalepleri, irsaliyeler, tip, {});
    const prevStillOpen =
      f.saId &&
      listMatchingMicirSatinAlma(satinAlmaTalepleri, irsaliyeler, tip, {}).some(
        (c) => c.sa.saId === f.saId
      );
    setSelectedSaId(best?.sa.saId || (prevStillOpen ? f.saId! : '') || f.saId || '');
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const kg = Number(String(kiloKg).replace(',', '.'));
    if (!irsaliyeNo.trim() || !plaka.trim() || !tarih || !Number.isFinite(kg) || kg <= 0) {
      alert('Tarih, irsaliye no, plaka ve kilo zorunludur.');
      return;
    }
    if (
      !window.confirm(
        editingApproved
          ? `Onaylı kayıt güncellenecek. İrsaliye ve cari geçmişi de yazılır. Devam?`
          : `Onaylanınca:\n1) İrsaliyeler sekmesine kayıt\n2) ${ENTO_MADEN_UNVAN} cari kart altına irsaliye geçmişi${
              editingSaMatch
                ? `\n3) Satın alma ${editingSaMatch.sa.saId} ile bağlanır (${editingSaMatch.kalem.urunAdi})`
                : '\n3) Eşleşen açık SA bulunamazsa irsaliye SA’sız oluşur'
            }\n\noluşacak. Devam?`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const ton = kgToTon(kg);
      const result = await approveMicirFis({
        fis: editing,
        correction: {
          tarih,
          irsaliyeNo: irsaliyeNo.trim().toUpperCase(),
          plaka: plaka.trim().toUpperCase(),
          tonaj: ton,
          kiloKg: kg,
          malzemeTipi,
          fisGorselUrl: editing.fisGorselUrl,
          firmaUnvan: entoCari?.unvan || editing.firmaUnvan || ENTO_MADEN_UNVAN,
          cariKartId: entoCari?.id || editing.cariKartId,
          saId: selectedSaId || editingSaMatch?.sa.saId,
          saKalemId: editingSaMatch?.kalem.id,
        },
        onaylayan: currentUser?.email || 'yonetici',
        cariKartlar,
        setCariKartlar,
        setIrsaliyeler,
        setCariIslemGecmisi,
        satinAlmaTalepleri,
        irsaliyeler,
      });

      await addNotification?.(
        `ENTO MADEN irsaliyesi onaylandı: ${result.fis.irsaliyeNo} · ${formatMicirMiktarLabel(result.fis.tonaj, result.fis.kiloKg)}${
          result.saMatch ? ` · SA ${result.saMatch.sa.saId}` : ''
        }`,
        {
          tip: 'MICIR_FIS_ONAYLANDI',
          micirFisId: result.fis.id,
          irsaliyeId: result.irsaliye.id,
          cariKartId: result.cariIslem.cariKartId,
          saId: result.saMatch?.sa.saId,
        }
      );

      alert(
        editingApproved
          ? `Güncellendi.\n\nİrsaliye: ${result.irsaliye.irsaliyeNo}\nMiktar: ${formatMicirMiktarLabel(result.fis.tonaj, result.fis.kiloKg)}`
          : `Onaylandı.\n\nİrsaliye: ${result.irsaliye.irsaliyeNo}\nCari: ${result.fis.firmaUnvan}\nMiktar: ${formatMicirMiktarLabel(result.fis.tonaj, result.fis.kiloKg)}${
              result.saMatch
                ? `\nSatın alma: ${result.saMatch.sa.saId} (${result.saMatch.kalem.urunAdi})`
                : '\nSatın alma: bağlanamadı (açık mıcır/stabilize SA yok)'
            }`
      );
      setEditing(null);
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message || '');
      if (msg === 'FIRESTORE_TIMEOUT' || msg.includes('zaman aşımı')) {
        alert(
          'Onay zaman aşımına uğradı. Büyük fotoğraf kaydı engellemiş olabilir.\n\nSayfayı yenileyip tekrar deneyin. Kayıt kısmen oluştuysa bekleyen listeden düşmüş olabilir — İrsaliyeler sekmesini kontrol edin.'
        );
      } else {
        alert('Onay başarısız: ' + (msg || 'bilinmeyen hata'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f: MicirStabilizeFis) => {
    const extra =
      f.durum === 'ONAYLANDI'
        ? '\n\nOnaylı irsaliye ve cari kaydı da silinecek.'
        : '';
    if (!window.confirm(`${f.irsaliyeNo} nolu kayıt silinsin mi?${extra}`)) return;
    try {
      await deleteMicirFisCascade({
        fis: f,
        irsaliyeler,
        setIrsaliyeler,
        setCariIslemGecmisi,
      });
      await addNotification?.(
        `Mıcır/Stabilize kaydı silindi: ${f.irsaliyeNo}`,
        { tip: 'MICIR_FIS_SILINDI', micirFisId: f.id }
      );
      if (editing?.id === f.id) setEditing(null);
    } catch (err: any) {
      alert('Silinemedi: ' + (err?.message || ''));
    }
  };

  const handleReject = async (f: MicirStabilizeFis) => {
    const neden = window.prompt('Red nedeni (opsiyonel):') || '';
    if (!window.confirm(`${f.irsaliyeNo} nolu kayıt reddedilsin mi?`)) return;
    try {
      await rejectMicirFis({
        fis: f,
        onaylayan: currentUser?.email || 'yonetici',
        redNedeni: neden,
      });
      await addNotification?.(
        `Mıcır/Stabilize kaydı reddedildi: ${f.irsaliyeNo}${neden ? ` · ${neden}` : ''}`,
        { tip: 'MICIR_FIS_REDDEDILDI', micirFisId: f.id }
      );
      if (editing?.id === f.id) setEditing(null);
    } catch (err: any) {
      alert('Red başarısız: ' + (err?.message || ''));
    }
  };

  return (
    <div className="space-y-4">
      <div className="border bg-white p-4 rounded-2xl border-[#D5DEE3] text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[#0F6C5C] font-bold block text-[12px] tracking-wide uppercase flex items-center gap-1.5">
              <Truck size={13} /> {ENTO_MADEN_UNVAN} · Kapı İrsaliye Onayı
            </span>
            <p className="text-[#5B6B73] leading-relaxed text-[11px]">
              Güvenliğin girdiği mıcır / stabilize / taş tozu evrakları irsaliyedir. Tarih, irsaliye no ve kilo
              kontrol edilip onaylanınca <strong>İrsaliyeler</strong> sekmesine ve{' '}
              <strong>{ENTO_MADEN_UNVAN}</strong> cari kartının altına yazılır.
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-black bg-[#E3F2EE] text-[#0F6C5C] border border-[#B9DBD2] px-2.5 py-1 rounded-lg">
            {pending.length} bekleyen
          </span>
        </div>
        <div className="flex gap-1.5 mt-3">
          <button
            type="button"
            onClick={() => { setListMode('bekleyen'); setEditing(null); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide cursor-pointer ${
              listMode === 'bekleyen'
                ? 'bg-[#0F6C5C] text-white'
                : 'bg-[#E3F2EE] text-[#0F6C5C] border border-[#B9DBD2]'
            }`}
          >
            Bekleyen ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => { setListMode('gecmis'); setEditing(null); }}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide cursor-pointer ${
              listMode === 'gecmis'
                ? 'bg-[#0F6C5C] text-white'
                : 'bg-[#E3F2EE] text-[#0F6C5C] border border-[#B9DBD2]'
            }`}
          >
            <History size={11} /> Geçmiş ({gecmis.length})
          </button>
        </div>
      </div>

      {!entoCari && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            <strong>{ENTO_MADEN_UNVAN}</strong> cari kartı henüz yok. Onay sırasında otomatik
            oluşturulacak ve irsaliye altına bağlanacak.
          </p>
        </div>
      )}

      {listMode === 'gecmis' && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={gecmisArama}
            onChange={(e) => setGecmisArama(e.target.value)}
            placeholder="İrsaliye no, plaka, tarih, kaydeden…"
            className="w-full bg-white border border-[#D5DEE3] rounded-xl pl-8 pr-3 py-2 text-[11px] font-semibold"
          />
        </div>
      )}

      {visibleList.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-[#D5DEE3]">
          <p className="text-sm font-bold text-slate-700">
            {listMode === 'bekleyen'
              ? 'Onay bekleyen mıcır/stabilize irsaliyesi yok.'
              : gecmis.length === 0
                ? 'Henüz geçmiş irsaliye yok.'
                : 'Aramaya uyan geçmiş kayıt yok.'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {listMode === 'bekleyen'
              ? `Güvenlik kapıdan yeni ${ENTO_MADEN_UNVAN} irsaliyesi gönderince burada listelenir.`
              : 'Onaylanan ve reddedilen kayıtlar Geçmiş sekmesinde görünür.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {visibleList.map((f) => {
              const badge = fisDurumLabel(f.durum);
              return (
              <div
                key={f.id}
                className={`bg-white border rounded-xl p-3 flex gap-3 ${
                  editing?.id === f.id ? 'border-[#0F6C5C] ring-1 ring-[#B9DBD2]' : 'border-[#D5DEE3]'
                }`}
              >
                {f.fisGorselUrl ? (
                  <button
                    type="button"
                    onClick={() => openBase64InNewTab(f.fisGorselUrl!, `micir_${f.irsaliyeNo}.jpg`)}
                    className="shrink-0 cursor-pointer"
                  >
                    <img
                      src={f.fisGorselUrl}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                  </button>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-100 border flex items-center justify-center shrink-0">
                    <Camera size={16} className="text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-900 truncate flex items-center gap-1.5 flex-wrap">
                    {f.irsaliyeNo} · {f.plaka}
                    {listMode === 'gecmis' && (
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${badge.className}`}>
                        {badge.text}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {f.tarih} · {malzemeTipiLabel(f.malzemeTipi)} ·{' '}
                    <strong>{formatMicirMiktarLabel(f.tonaj, f.kiloKg)}</strong>
                  </p>
                  <p className="text-[9px] text-slate-500 truncate">{f.firmaUnvan || ENTO_MADEN_UNVAN}</p>
                  <p className="text-[9px] text-slate-400">Kaydeden: {f.kaydeden || '—'}</p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => openEdit(f)}
                      className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-[#0F6C5C] text-white cursor-pointer"
                    >
                      <Pencil size={11} /> {listMode === 'gecmis' ? 'Düzelt' : 'Düzelt / Onayla'}
                    </button>
                    {listMode === 'bekleyen' ? (
                      <button
                        type="button"
                        onClick={() => handleReject(f)}
                        className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                      >
                        <X size={11} /> Reddet
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
                        className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                      >
                        <Trash2 size={11} /> Sil
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="bg-white border border-[#D5DEE3] rounded-2xl p-4">
            {!editing ? (
              <div className="h-full min-h-[240px] flex items-center justify-center text-slate-400 text-xs italic">
                Soldan bir irsaliye seçip düzeltme / onay formunu açın.
              </div>
            ) : (
              <form onSubmit={handleApprove} className="space-y-3 text-xs">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-[#0F6C5C] border-b border-[#E8EEF0] pb-2">
                  {ENTO_MADEN_UNVAN} İrsaliye — Düzelt &amp; Kaydet
                </h4>
                {editing.fisGorselUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      openBase64InNewTab(editing.fisGorselUrl!, `micir_${editing.irsaliyeNo}.jpg`)
                    }
                    className="w-full cursor-pointer"
                  >
                    <img
                      src={editing.fisGorselUrl}
                      alt="İrsaliye"
                      className="max-h-44 w-full object-contain rounded-xl border bg-slate-50"
                    />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Tarih *</label>
                    <input
                      type="date"
                      required
                      value={tarih}
                      onChange={(e) => setTarih(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">İrsaliye No *</label>
                    <input
                      required
                      value={irsaliyeNo}
                      onChange={(e) => setIrsaliyeNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Plaka *</label>
                    <input
                      required
                      value={plaka}
                      onChange={(e) => setPlaka(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Kilo (kg) *</label>
                    <input
                      required
                      type="number"
                      min={1}
                      step={1}
                      value={kiloKg}
                      onChange={(e) => setKiloKg(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                    {Number(kiloKg) > 0 && (
                      <p className="text-[10px] text-emerald-700 font-semibold">
                        = {kgToTon(Number(kiloKg)).toLocaleString('tr-TR')} ton
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Malzeme</label>
                    <select
                      value={malzemeTipi}
                      onChange={(e) => setMalzemeTipi(e.target.value as MicirMalzemeTipi)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    >
                      <option value="MICIR">Mıcır</option>
                      <option value="STABILIZE">Stabilize</option>
                      <option value="TAS_TOZU">Taş Tozu</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">
                    Satın alma (SA) bağı
                  </label>
                  <select
                    value={selectedSaId}
                    onChange={(e) => setSelectedSaId(e.target.value)}
                    className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 font-bold text-[11px]"
                  >
                    <option value="">— SA bağlama (sadece irsaliye) —</option>
                    {saCandidates.map((c) => (
                      <option key={`${c.sa.saId}-${c.kalem.id}`} value={c.sa.saId}>
                        {c.sa.saId} · {c.kalem.urunAdi} · kalan{' '}
                        {c.kalan.toLocaleString('tr-TR')} · {c.sa.tarih || '—'}
                      </option>
                    ))}
                  </select>
                  {editing?.saId && editing.saId !== selectedSaId && (
                    <p className="text-[10px] text-amber-700 font-semibold">
                      Kapıda önceki öneri: {editing.saId} — aşağıda güncel / seçtiğiniz SA
                      kullanılacak.
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-slate-600 bg-[#E3F2EE] border border-[#B9DBD2] rounded-xl px-3 py-2">
                  Kaydet → <strong>İrsaliye</strong> + <strong>{entoCari?.unvan || ENTO_MADEN_UNVAN}</strong>{' '}
                  cari kart altına irsaliye geçmişi oluşur.
                  {editingSaMatch ? (
                    <span className="block mt-1 text-emerald-800 font-bold">
                      Satın alma bağlanacak: {editingSaMatch.sa.saId} · {editingSaMatch.kalem.urunAdi}
                      {editingSaMatch.kalan > 0
                        ? ` · kalan ${editingSaMatch.kalan.toLocaleString('tr-TR')}`
                        : ''}
                    </span>
                  ) : (
                    <span className="block mt-1 text-amber-800 font-semibold">
                      Açık mıcır/stabilize satın alma seçilmedi — irsaliye SA’sız oluşur; evrak
                      zincirinde bu SA altında görünmez.
                    </span>
                  )}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#0F6C5C] hover:bg-[#0C584B] text-white font-black text-[10px] py-3 rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    {editingApproved ? 'KAYDET' : 'ONAYLA & CARİYE KAYDET'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-[10px] cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MicirFisOnayPanel;
