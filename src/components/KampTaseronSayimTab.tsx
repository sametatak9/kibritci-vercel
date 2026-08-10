import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  LogOut,
  Save,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  CariKart,
  KampTaseronSayim,
  KampTaseronSayimIslem,
  KampTaseronSayimIslemTipi,
  Personel,
} from '../types/erp';
import { saveDocument } from '../lib/firebase';
import { validateTC } from '../lib/personelOdemeUtils';
import { submitPersonelCikisTalebi } from '../lib/personelCikisTalebiUtils';
import { openTaseronSayimListeRaporu } from '../lib/taseronSayimListeRapor';
import { firmaEslesir, getTaseronCariKartlar } from '../lib/taseronUtils';
import { isTaseronPersonel } from '../lib/yoklamaUtils';

const digitsOnly = (raw: string) => String(raw || '').replace(/\D/g, '');
const phoneMatchKey = (raw: string) => {
  const d = digitsOnly(raw);
  return d.length >= 10 ? d.slice(-10) : d;
};

type DraftRow = {
  tcNo: string;
  telefonNo: string;
  mykDurumu: 'VAR' | 'YOK' | 'BILINMIYOR';
};

interface KampTaseronSayimTabProps {
  personeller: Personel[];
  setPersoneller?: React.Dispatch<React.SetStateAction<Personel[]>>;
  cariKartlar?: CariKart[];
  currentUser?: { email?: string };
  addNotification?: (mesaj: string) => void;
  showStatus?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

function personelAktif(p: Personel) {
  return p.durum === true || String(p.durum) === 'true';
}

function eksikTc(p: Personel) {
  return !validateTC(p.tcNo || '');
}

function eksikTel(p: Personel) {
  return phoneMatchKey(p.telefonNo || '').length < 10;
}

export const KampTaseronSayimTab: React.FC<KampTaseronSayimTabProps> = ({
  personeller,
  setPersoneller,
  cariKartlar = [],
  currentUser,
  addNotification,
  showStatus,
}) => {
  const email = currentUser?.email || 'kampci';
  const [selectedFirma, setSelectedFirma] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyEksik, setShowOnlyEksik] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sessionId] = useState(() => `sayim_${Date.now()}`);
  const [sessionIslemler, setSessionIslemler] = useState<KampTaseronSayimIslem[]>([]);
  const [savingSession, setSavingSession] = useState(false);

  const taseronCariler = useMemo(() => getTaseronCariKartlar(cariKartlar), [cariKartlar]);

  const firmaOptions = useMemo(() => {
    const fromCari = taseronCariler.map((c) => c.unvan).filter(Boolean);
    const fromPersonel = personeller
      .filter(isTaseronPersonel)
      .map((p) => String(p.firmaAdi || '').trim())
      .filter(Boolean);
    const merged = [...fromCari, ...fromPersonel];
    const seen = new Set<string>();
    const out: string[] = [];
    merged.forEach((f) => {
      const key = f.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(f);
    });
    return out.sort((a, b) => a.localeCompare(b, 'tr'));
  }, [taseronCariler, personeller]);

  const firmaPersonelleri = useMemo(() => {
    if (!selectedFirma) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return personeller
      .filter((p) => isTaseronPersonel(p) && firmaEslesir(p.firmaAdi || '', selectedFirma))
      .filter((p) => {
        if (!q) return true;
        const blob = `${p.ad} ${p.soyad} ${p.gorev || ''} ${p.tcNo || ''} ${p.telefonNo || ''}`.toLocaleLowerCase('tr-TR');
        return blob.includes(q);
      })
      .filter((p) => {
        if (!showOnlyEksik) return true;
        return eksikTc(p) || eksikTel(p) || !p.mykDurumu || p.mykDurumu === 'BILINMIYOR';
      })
      .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));
  }, [personeller, selectedFirma, searchQuery, showOnlyEksik]);

  const getDraft = (p: Personel): DraftRow => {
    if (drafts[p.id]) return drafts[p.id];
    return {
      tcNo: digitsOnly(p.tcNo || ''),
      telefonNo: String(p.telefonNo || '').trim(),
      mykDurumu: p.mykDurumu || 'BILINMIYOR',
    };
  };

  const patchDraft = (personelId: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => {
      const p = personeller.find((x) => x.id === personelId);
      const fromPrev = prev[personelId];
      const base: DraftRow =
        fromPrev ||
        (p
          ? {
              tcNo: digitsOnly(p.tcNo || ''),
              telefonNo: String(p.telefonNo || '').trim(),
              mykDurumu: p.mykDurumu || 'BILINMIYOR',
            }
          : { tcNo: '', telefonNo: '', mykDurumu: 'BILINMIYOR' });
      return { ...prev, [personelId]: { ...base, ...patch } };
    });
  };

  const logIslem = async (
    personel: Personel,
    islemTipi: KampTaseronSayimIslemTipi,
    detay: string
  ): Promise<KampTaseronSayimIslem> => {
    const islem: KampTaseronSayimIslem = {
      id: `tsayim_islem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      personelId: personel.id,
      personelIsim: `${personel.ad} ${personel.soyad}`,
      firmaAdi: selectedFirma,
      islemTipi,
      detay,
      tarih: new Date().toISOString(),
      yapan: email,
    };
    await saveDocument('kampTaseronSayimIslemleri', islem);
    setSessionIslemler((prev) => [...prev, islem]);
    return islem;
  };

  const handleSavePerson = async (personel: Personel) => {
    const draft = getDraft(personel);
    const changes: string[] = [];

    if (draft.tcNo && !validateTC(draft.tcNo)) {
      showStatus?.('error', 'Geçerli 11 haneli TC girin.');
      return;
    }
    if (draft.telefonNo && phoneMatchKey(draft.telefonNo).length > 0 && phoneMatchKey(draft.telefonNo).length < 10) {
      showStatus?.('error', 'Telefon en az 10 hane olmalı.');
      return;
    }

    const next: Personel = { ...personel };
    if (draft.tcNo && digitsOnly(personel.tcNo || '') !== draft.tcNo) {
      next.tcNo = draft.tcNo;
      changes.push('TC güncellendi');
    }
    if (draft.telefonNo && phoneMatchKey(personel.telefonNo || '') !== phoneMatchKey(draft.telefonNo)) {
      next.telefonNo = draft.telefonNo.trim();
      changes.push('Telefon güncellendi');
    }
    if (draft.mykDurumu !== (personel.mykDurumu || 'BILINMIYOR')) {
      next.mykDurumu = draft.mykDurumu;
      changes.push(`MYK: ${draft.mykDurumu}`);
    }

    if (changes.length === 0) {
      showStatus?.('info', 'Kaydedilecek değişiklik yok.');
      return;
    }

    setSavingId(personel.id);
    try {
      await saveDocument('personeller', next);
      setPersoneller?.((prev) => prev.map((p) => (p.id === next.id ? next : p)));

      let tip: KampTaseronSayimIslemTipi = 'GENEL_GUNCELLEME';
      if (changes.some((c) => c.startsWith('TC'))) tip = 'TC_EKLENDI';
      else if (changes.some((c) => c.startsWith('Telefon'))) tip = 'TEL_EKLENDI';
      else if (changes.some((c) => c.startsWith('MYK'))) tip = 'MYK_ISARETLENDI';

      await logIslem(personel, tip, changes.join(' · '));
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[personel.id];
        return copy;
      });
      showStatus?.('success', `${personel.ad} ${personel.soyad} kaydedildi.`);
      addNotification?.(`${personel.ad} ${personel.soyad} — taşeron sayım güncellendi (${changes.join(', ')})`);
    } catch (err) {
      console.error(err);
      showStatus?.('error', 'Kayıt sırasında hata oluştu.');
    } finally {
      setSavingId(null);
    }
  };

  const handleIstenCikis = async (personel: Personel) => {
    if (
      !window.confirm(
        `${personel.ad} ${personel.soyad} işten çıkarılsın mı?\n\nPersonel pasif yapılacak.`
      )
    ) {
      return;
    }
    const sendTalebi = window.confirm(
      'Yönetime işten çıkış onay talebi de gönderilsin mi?\n\nEvet: onay havuzuna düşer.\nHayır: sadece personel pasif yapılır.'
    );

    setSavingId(personel.id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const next: Personel = {
        ...personel,
        durum: false,
        istenCikisTarihi: today,
      };
      await saveDocument('personeller', next);
      setPersoneller?.((prev) => prev.map((p) => (p.id === next.id ? next : p)));

      if (sendTalebi) {
        await submitPersonelCikisTalebi({
          personelId: personel.id,
          personelIsim: `${personel.ad} ${personel.soyad}`,
          personelGorev: personel.gorev || '',
          personelMaas: personel.maas ?? 0,
          cikisTarihi: today,
          cikisNedeni: `Taşeron sayım — ${selectedFirma}; kampçı tarafından işten çıkış.`,
          gonderen: email,
          kaynak: 'KAMPCI_TASERON_SAYIM',
        });
      }

      await logIslem(
        personel,
        'ISTEN_CIKIS',
        sendTalebi ? 'Pasif yapıldı · işten çıkış talebi gönderildi' : 'Pasif yapıldı (talep gönderilmedi)'
      );
      showStatus?.('success', `${personel.ad} ${personel.soyad} işten çıkarıldı.`);
      addNotification?.(`${personel.ad} ${personel.soyad} taşeron sayımda işten çıkarıldı.`);
    } catch (err) {
      console.error(err);
      showStatus?.('error', 'İşten çıkış kaydedilemedi.');
    } finally {
      setSavingId(null);
    }
  };

  const handleIseGiris = async (personel: Personel) => {
    if (!window.confirm(`${personel.ad} ${personel.soyad} tekrar aktif (işe giriş) yapılsın mı?`)) return;

    setSavingId(personel.id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const next: Personel = {
        ...personel,
        durum: true,
        istenCikisTarihi: undefined,
        iseGirisTarihi: personel.iseGirisTarihi || today,
      };
      await saveDocument('personeller', next);
      setPersoneller?.((prev) => prev.map((p) => (p.id === next.id ? next : p)));
      await logIslem(personel, 'ISE_GIRIS', 'Personel aktif yapıldı');
      showStatus?.('success', `${personel.ad} ${personel.soyad} aktif yapıldı.`);
      addNotification?.(`${personel.ad} ${personel.soyad} taşeron sayımda işe alındı / aktif.`);
    } catch (err) {
      console.error(err);
      showStatus?.('error', 'İşe giriş kaydedilemedi.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveSession = async () => {
    if (!selectedFirma) {
      showStatus?.('error', 'Önce taşeron firma seçin.');
      return;
    }
    if (sessionIslemler.length === 0) {
      showStatus?.('info', 'Bu oturumda kayıtlı işlem yok.');
      return;
    }
    if (!window.confirm(`${sessionIslemler.length} işlemli sayım oturumu kaydedilsin mi?`)) return;

    setSavingSession(true);
    try {
      const tcTam = sessionIslemler.filter((i) => i.islemTipi === 'TC_EKLENDI').length;
      const telTam = sessionIslemler.filter((i) => i.islemTipi === 'TEL_EKLENDI').length;
      const mykTam = sessionIslemler.filter((i) => i.islemTipi === 'MYK_ISARETLENDI').length;
      const cikis = sessionIslemler.filter((i) => i.islemTipi === 'ISTEN_CIKIS').length;
      const giris = sessionIslemler.filter((i) => i.islemTipi === 'ISE_GIRIS').length;

      const session: KampTaseronSayim = {
        id: sessionId,
        firmaAdi: selectedFirma,
        tarih: new Date().toISOString().slice(0, 10),
        baslangic: sessionIslemler[0]?.tarih || new Date().toISOString(),
        bitis: new Date().toISOString(),
        yapan: email,
        islemSayisi: sessionIslemler.length,
        ozet: {
          toplamPersonel: firmaPersonelleri.length,
          tcTamamlanan: tcTam,
          telTamamlanan: telTam,
          mykIsaretlenen: mykTam,
          istenCikis: cikis,
          iseGiris: giris,
        },
        islemIds: sessionIslemler.map((i) => i.id),
      };
      await saveDocument('kampTaseronSayimlari', session);
      showStatus?.('success', `Sayım oturumu kaydedildi (${session.islemSayisi} işlem).`);
      addNotification?.(`${selectedFirma} taşeron sayım oturumu kaydedildi · ${session.islemSayisi} işlem`);
    } catch (err) {
      console.error(err);
      showStatus?.('error', 'Oturum kaydedilemedi.');
    } finally {
      setSavingSession(false);
    }
  };

  const eksikSayisi = firmaPersonelleri.filter(
    (p) => eksikTc(p) || eksikTel(p) || !p.mykDurumu || p.mykDurumu === 'BILINMIYOR'
  ).length;

  const handleOpenSayimListesi = () => {
    try {
      const count = openTaseronSayimListeRaporu({ personeller });
      showStatus?.('success', `Taşeron sayım listesi oluşturuldu (${count} personel).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Liste oluşturulamadı.';
      showStatus?.('error', msg);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <ClipboardList className="text-amber-700" size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Taşeron Sayım</h3>
              <p className="text-xs text-slate-500">
                Taşeron firma personel listesi · eksik evrak tamamlama · MYK işaretleme · işe giriş/çıkış
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenSayimListesi}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
            >
              <FileText size={14} />
              Taşeron Sayım Listesi
            </button>
            <button
              type="button"
              onClick={handleSaveSession}
              disabled={savingSession || sessionIslemler.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
            >
              {savingSession ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Oturumu Kaydet ({sessionIslemler.length})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Taşeron Firma</label>
            <select
              value={selectedFirma}
              onChange={(e) => setSelectedFirma(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none"
            >
              <option value="">— Firma Seçin —</option>
              {firmaOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Ara</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ad, TC, telefon, görev..."
                className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 pl-9 pr-3 py-2.5 rounded-xl outline-none"
              />
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyEksik}
                onChange={(e) => setShowOnlyEksik(e.target.checked)}
                className="rounded"
              />
              Sadece eksik evraklıları göster
            </label>
          </div>
        </div>

        {selectedFirma && (
          <div className="mt-4 space-y-3">
            <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
              Sayımda tespit edilmeyen aktif personel için kart altındaki <strong>Personel İşten Çıkar</strong> butonunu kullanın.
            </p>
            <div className="flex flex-wrap gap-3 text-[10px] font-bold">
            <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
              <Users size={12} className="inline mr-1" />
              {firmaPersonelleri.length} personel
            </span>
            <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800">
              <AlertTriangle size={12} className="inline mr-1" />
              {eksikSayisi} eksik evrak
            </span>
            <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800">
              <CheckCircle2 size={12} className="inline mr-1" />
              {sessionIslemler.length} işlem bu oturumda
            </span>
            </div>
          </div>
        )}
      </div>

      {!selectedFirma ? (
        <div className="text-center p-12 text-slate-500 italic bg-white border border-slate-200 rounded-2xl">
          Sayıma başlamak için taşeron firma seçin.
        </div>
      ) : firmaPersonelleri.length === 0 ? (
        <div className="text-center p-12 text-slate-500 italic bg-white border border-slate-200 rounded-2xl">
          Bu firmaya bağlı personel bulunamadı.
        </div>
      ) : (
        <div className="space-y-3">
          {firmaPersonelleri.map((p) => {
            const draft = getDraft(p);
            const tcEksik = eksikTc(p);
            const telEksik = eksikTel(p);
            const mykEksik = !p.mykDurumu || p.mykDurumu === 'BILINMIYOR';
            const aktif = personelAktif(p);
            const busy = savingId === p.id;

            return (
              <div
                key={p.id}
                className={`bg-white border rounded-2xl p-4 shadow-sm ${
                  tcEksik || telEksik || mykEksik ? 'border-amber-200' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-slate-800">
                      {p.ad} {p.soyad}
                      <span
                        className={`ml-2 text-[10px] font-black px-2 py-0.5 rounded-full ${
                          aktif ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {aktif ? 'AKTİF' : 'PASİF'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{p.gorev || 'Görev belirtilmedi'}</div>
                    {(tcEksik || telEksik || mykEksik) && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tcEksik && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                            TC EKSİK
                          </span>
                        )}
                        {telEksik && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">
                            TEL EKSİK
                          </span>
                        )}
                        {mykEksik && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                            MYK ?
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">
                      TC Kimlik No {tcEksik && <span className="text-red-600">*</span>}
                    </label>
                    <input
                      value={draft.tcNo}
                      onChange={(e) => patchDraft(p.id, { tcNo: digitsOnly(e.target.value).slice(0, 11) })}
                      placeholder={tcEksik ? '11 haneli TC girin' : draft.tcNo || '—'}
                      className={`w-full border text-xs p-2.5 rounded-xl outline-none ${
                        tcEksik ? 'bg-red-50/50 border-red-200' : 'bg-slate-50 border-slate-200'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">
                      Telefon {telEksik && <span className="text-orange-600">*</span>}
                    </label>
                    <input
                      value={draft.telefonNo}
                      onChange={(e) => patchDraft(p.id, { telefonNo: e.target.value })}
                      placeholder={telEksik ? 'Telefon girin' : draft.telefonNo || '—'}
                      className={`w-full border text-xs p-2.5 rounded-xl outline-none ${
                        telEksik ? 'bg-orange-50/50 border-orange-200' : 'bg-slate-50 border-slate-200'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">MYK</label>
                    <div className="flex gap-1">
                      {(['VAR', 'YOK', 'BILINMIYOR'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => patchDraft(p.id, { mykDurumu: v })}
                          className={`flex-1 py-2 rounded-lg text-[9px] font-black border ${
                            draft.mykDurumu === v
                              ? v === 'VAR'
                                ? 'bg-emerald-600 text-white border-emerald-500'
                                : v === 'YOK'
                                  ? 'bg-slate-700 text-white border-slate-600'
                                  : 'bg-amber-500 text-white border-amber-400'
                              : 'bg-white text-slate-500 border-slate-200'
                          }`}
                        >
                          {v === 'VAR' ? 'VAR' : v === 'YOK' ? 'YOK' : '?'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  {aktif ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleIstenCikis(p)}
                      className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black border border-red-500 disabled:opacity-50 shadow-sm"
                    >
                      <LogOut size={15} /> Personel İşten Çıkar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleIseGiris(p)}
                      className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black border border-emerald-500 disabled:opacity-50 shadow-sm"
                    >
                      <UserCheck size={15} /> İşe Al / Aktif
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSavePerson(p)}
                    className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-black disabled:opacity-50 shadow-sm"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Kaydet
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
