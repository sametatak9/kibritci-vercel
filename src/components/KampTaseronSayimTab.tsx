import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  LogOut,
  Save,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  CariKart,
  KampTaseronSayim,
  KampTaseronSayimIslem,
  KampTaseronSayimIslemTipi,
  KampTaseronSayimPersonelGuncelleme,
  Personel,
} from '../types/erp';
import { db, saveDocument } from '../lib/firebase';
import {
  buildIseGirisPatch,
  buildPersonelPatchFromDraft,
  buildSessionIslemFromPatch,
  mergePendingPatches,
  phoneMatchKey,
  summarizeTaseronSayimGuncellemeleri,
  validateTaseronSayimSession,
} from '../lib/kampTaseronSayimOnayUtils';
import { validateTC } from '../lib/personelOdemeUtils';
import { submitPersonelCikisTalebi } from '../lib/personelCikisTalebiUtils';
import { openTaseronSayimListeRaporu } from '../lib/taseronSayimListeRapor';
import { firmaEslesir, getTaseronCariKartlar } from '../lib/taseronUtils';
import { isTaseronPersonel } from '../lib/yoklamaUtils';

const digitsOnly = (raw: string) => String(raw || '').replace(/\D/g, '');

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
  const [sessionId, setSessionId] = useState(() => `sayim_${Date.now()}`);
  const [sessionIslemler, setSessionIslemler] = useState<KampTaseronSayimIslem[]>([]);
  const [pendingPatches, setPendingPatches] = useState<
    Record<string, KampTaseronSayimPersonelGuncelleme>
  >({});
  const [savingSession, setSavingSession] = useState(false);
  const [pendingCikisPersonelIds, setPendingCikisPersonelIds] = useState<Set<string>>(new Set());
  const [bekleyenSayimlar, setBekleyenSayimlar] = useState<KampTaseronSayim[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'personelCikisTalepleri'), where('durum', '==', 'BEKLEMEDE'));
    return onSnapshot(
      q,
      (snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((docSnap) => {
          const personelId = String(docSnap.data().personelId || '').trim();
          if (personelId) ids.add(personelId);
        });
        setPendingCikisPersonelIds(ids);
      },
      (err) => console.warn('İşten çıkış talepleri dinlenemedi:', err)
    );
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'kampTaseronSayimlari'), where('durum', '==', 'BEKLEMEDE'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as KampTaseronSayim);
        list.sort((a, b) => String(b.baslangic || '').localeCompare(String(a.baslangic || '')));
        setBekleyenSayimlar(list);
      },
      (err) => console.warn('Taşeron sayım oturumları dinlenemedi:', err)
    );
  }, []);

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

  const bekleyenFirmaSayimi = useMemo(
    () =>
      bekleyenSayimlar.find((s) => firmaEslesir(s.firmaAdi || '', selectedFirma)) || null,
    [bekleyenSayimlar, selectedFirma]
  );

  const pendingPatchCount = Object.keys(pendingPatches).length;

  const getDraft = (p: Personel): DraftRow => {
    if (drafts[p.id]) return drafts[p.id];
    const queued = pendingPatches[p.id];
    return {
      tcNo: queued?.tcNo ?? digitsOnly(p.tcNo || ''),
      telefonNo: queued?.telefonNo ?? String(p.telefonNo || '').trim(),
      mykDurumu: queued?.mykDurumu ?? p.mykDurumu ?? 'BILINMIYOR',
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

  const queueLocalIslem = (
    personel: Personel,
    islemTipi: KampTaseronSayimIslemTipi,
    detay: string
  ) => {
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
    setSessionIslemler((prev) => [...prev, islem]);
    return islem;
  };

  const handleSavePerson = (personel: Personel) => {
    const draft = getDraft(personel);
    const { patch, error } = buildPersonelPatchFromDraft(personel, draft);
    if (error || !patch) {
      showStatus?.('error', error || 'Kaydedilecek değişiklik yok.');
      return;
    }

    setPendingPatches((prev) => mergePendingPatches(prev, patch));
    const islem = buildSessionIslemFromPatch(sessionId, selectedFirma, patch, email);
    setSessionIslemler((prev) => [...prev, islem]);
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[personel.id];
      return copy;
    });
    showStatus?.(
      'success',
      `${personel.ad} ${personel.soyad} taslak kaydedildi. Sayım Kaydet ile yöneticiye gönderin.`
    );
  };

  const handleIstenCikis = async (personel: Personel) => {
    if (pendingCikisPersonelIds.has(personel.id)) {
      showStatus?.('info', 'Bu personel için zaten yönetici onayı bekleyen işten çıkış talebi var.');
      return;
    }

    if (
      !window.confirm(
        `${personel.ad} ${personel.soyad} için işten çıkış talebi gönderilsin mi?\n\nPersonel yönetici onayından sonra pasife alınır. Onay gelene kadar aktif kalır.`
      )
    ) {
      return;
    }

    setSavingId(personel.id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await submitPersonelCikisTalebi({
        personelId: personel.id,
        personelIsim: `${personel.ad} ${personel.soyad}`,
        personelGorev: personel.gorev || '',
        personelMaas: personel.maas ?? 0,
        cikisTarihi: today,
        cikisNedeni: `Taşeron sayım — ${selectedFirma}; sayımda tespit edilmedi; kampçı işten çıkış talebi.`,
        gonderen: email,
        kaynak: 'KAMPCI_TASERON_SAYIM',
        hedefYoneticiRole: 'YÖNETİCİ',
      });

      queueLocalIslem(personel, 'ISTEN_CIKIS', 'İşten çıkış talebi yönetim onayına gönderildi');
      showStatus?.(
        'success',
        `${personel.ad} ${personel.soyad} — işten çıkış talebi gönderildi. Yönetici onayı bekleniyor.`
      );
      addNotification?.(
        `${personel.ad} ${personel.soyad} taşeron sayımda işten çıkış talebi gönderildi (yönetici onayı bekleniyor).`
      );
    } catch (err) {
      console.error(err);
      showStatus?.('error', 'İşten çıkış talebi gönderilemedi.');
    } finally {
      setSavingId(null);
    }
  };

  const handleIseGiris = (personel: Personel) => {
    if (
      !window.confirm(
        `${personel.ad} ${personel.soyad} tekrar aktif (işe giriş) yapılacak.\n\nDeğişiklik yönetici onayından sonra uygulanır. Taslak olarak kaydedilsin mi?`
      )
    ) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const patch = buildIseGirisPatch(personel, today);
    setPendingPatches((prev) => mergePendingPatches(prev, patch));
    const islem = buildSessionIslemFromPatch(sessionId, selectedFirma, patch, email);
    setSessionIslemler((prev) => [...prev, islem]);
    showStatus?.(
      'success',
      `${personel.ad} ${personel.soyad} işe giriş taslağı kaydedildi. Sayım Kaydet ile yöneticiye gönderin.`
    );
  };

  const resetSession = () => {
    setSessionId(`sayim_${Date.now()}`);
    setSessionIslemler([]);
    setPendingPatches({});
    setDrafts({});
  };

  const handleSaveSession = async () => {
    if (!selectedFirma) {
      showStatus?.('error', 'Önce taşeron firma seçin.');
      return;
    }

    const personelGuncellemeleri = Object.values(pendingPatches) as KampTaseronSayimPersonelGuncelleme[];
    const validation = validateTaseronSayimSession({
      firmaAdi: selectedFirma,
      personelGuncellemeleri,
      personeller,
    });
    if (validation.ok === false) {
      showStatus?.('error', validation.error);
      return;
    }

    if (
      !window.confirm(
        `${personelGuncellemeleri.length} personel güncellemesi yönetici onayına gönderilsin mi?\n\nOnaylanana kadar Personel Yönetimi'nde değişiklik yapılmaz.`
      )
    ) {
      return;
    }

    setSavingSession(true);
    try {
      const counts = summarizeTaseronSayimGuncellemeleri(personelGuncellemeleri);
      const cikis = sessionIslemler.filter((i) => i.islemTipi === 'ISTEN_CIKIS').length;

      const session: KampTaseronSayim = {
        id: sessionId,
        firmaAdi: selectedFirma,
        tarih: new Date().toISOString().slice(0, 10),
        baslangic: sessionIslemler[0]?.tarih || new Date().toISOString(),
        bitis: new Date().toISOString(),
        yapan: email,
        islemSayisi: personelGuncellemeleri.length,
        durum: 'BEKLEMEDE',
        personelGuncellemeleri,
        ozet: {
          toplamPersonel: firmaPersonelleri.length,
          tcTamamlanan: counts.TC_EKLENDI,
          telTamamlanan: counts.TEL_EKLENDI,
          mykIsaretlenen: counts.MYK_ISARETLENDI,
          istenCikis: cikis,
          iseGiris: counts.ISE_GIRIS,
        },
        islemIds: sessionIslemler.map((i) => i.id),
      };

      await saveDocument('kampTaseronSayimlari', session);

      for (const islem of sessionIslemler) {
        await saveDocument('kampTaseronSayimIslemleri', { ...islem, sessionId });
      }

      resetSession();
      showStatus?.(
        'success',
        `Sayım yönetici onayına gönderildi (${personelGuncellemeleri.length} personel güncellemesi).`
      );
      addNotification?.(
        `${selectedFirma} taşeron sayımı yönetici onayına gönderildi · ${personelGuncellemeleri.length} güncelleme`
      );
    } catch (err) {
      console.error(err);
      showStatus?.('error', 'Sayım kaydedilemedi. Lütfen tekrar deneyin.');
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
              disabled={savingSession || pendingPatchCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
            >
              {savingSession ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Sayım Kaydet — Yönetici Onayı ({pendingPatchCount})
            </button>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-xl bg-sky-50 border border-sky-100 text-[10px] text-sky-900 leading-relaxed space-y-1">
          <p className="font-black uppercase tracking-wide text-sky-800">Kampçı rehberi — adım adım</p>
          <p>
            <strong>1.</strong> Doğru <strong>taşeron firmayı</strong> seçin (yanlış firma = yanlış personel listesi).
          </p>
          <p>
            <strong>2.</strong> Eksik TC, telefon ve MYK bilgilerini girin; her kartta <strong>Kaydet</strong> ile
            taslağa alın.
          </p>
          <p>
            <strong>3.</strong> Sayımda olmayan aktif personel için <strong>Personel İşten Çıkar</strong> (ayrı onay).
          </p>
          <p>
            <strong>4.</strong> Bitince <strong>Sayım Kaydet — Yönetici Onayı</strong> ile gönderin. Onaydan sonra
            Personel Yönetimi güncellenir.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">
              Taşeron Firma <span className="text-red-600">*</span>
            </label>
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
            {bekleyenFirmaSayimi && (
              <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
                <Clock size={12} />
                Bu firma için yönetici onayı bekleyen sayım var ({bekleyenFirmaSayimi.islemSayisi} güncelleme). Yeni
                sayım gönderebilirsiniz; yönetici sırayla onaylar.
              </p>
            )}
            <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
              Sayımda tespit edilmeyen aktif personel için <strong>Personel İşten Çıkar</strong> ile yönetime talep
              gönderin. Personel, yönetici onayından sonra pasife alınır.
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
                {pendingPatchCount} taslak güncelleme
              </span>
              {sessionIslemler.filter((i) => i.islemTipi === 'ISTEN_CIKIS').length > 0 && (
                <span className="px-2 py-1 rounded-lg bg-red-50 text-red-800">
                  {sessionIslemler.filter((i) => i.islemTipi === 'ISTEN_CIKIS').length} çıkış talebi (ayrı onay)
                </span>
              )}
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
            const cikisOnayBekliyor = pendingCikisPersonelIds.has(p.id);
            const taslakVar = Boolean(pendingPatches[p.id]);

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
                      {taslakVar && (
                        <span className="ml-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                          TASLAK
                        </span>
                      )}
                      {cikisOnayBekliyor && (
                        <span className="ml-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          ÇIKIŞ ONAY BEKLİYOR
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{p.gorev || 'Görev belirtilmedi'}</div>
                    {taslakVar && pendingPatches[p.id]?.detay && (
                      <p className="text-[9px] text-sky-700 mt-1 font-bold">{pendingPatches[p.id].detay}</p>
                    )}
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
                      disabled={busy || cikisOnayBekliyor}
                      onClick={() => handleIstenCikis(p)}
                      className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black border border-red-500 disabled:opacity-50 shadow-sm"
                    >
                      <LogOut size={15} />
                      {cikisOnayBekliyor ? 'Çıkış Onayı Bekleniyor' : 'Personel İşten Çıkar'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleIseGiris(p)}
                      className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black border border-emerald-500 disabled:opacity-50 shadow-sm"
                    >
                      <UserCheck size={15} /> İşe Al / Aktif (Taslak)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSavePerson(p)}
                    className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-black disabled:opacity-50 shadow-sm"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Taslağa Kaydet
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
