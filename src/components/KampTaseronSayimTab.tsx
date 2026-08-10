import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  FileText,
  Loader2,
  LogOut,
  Save,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  AylikYoklamaMap,
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
import { CANONICAL_ANA_FIRMA_ADI, isTaseronPersonel } from '../lib/yoklamaUtils';
import type { YoklamaSaveSource } from '../lib/yoklamaPersistence';

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
  /** Ana firma günlük yoklama */
  yoklamalar?: AylikYoklamaMap;
  setYoklamalar?: React.Dispatch<React.SetStateAction<AylikYoklamaMap>>;
  saveYoklamalarNow?: (
    next: AylikYoklamaMap,
    kaynak?: YoklamaSaveSource
  ) => Promise<unknown>;
}

type PanelView = 'taseron' | 'ana_firma' | 'eksik_myk';

function personelAktif(p: Personel) {
  return p.durum === true || String(p.durum) === 'true';
}

function eksikMyk(p: Personel) {
  return !p.mykDurumu || p.mykDurumu === 'BILINMIYOR';
}

function personHasEksik(p: Personel) {
  return eksikTc(p) || eksikTel(p) || eksikMyk(p);
}

function eksikTc(p: Personel) {
  return !validateTC(p.tcNo || '');
}

function isAnaFirmaPersonel(p: Personel) {
  return !isTaseronPersonel(p);
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
  yoklamalar = {},
  setYoklamalar,
  saveYoklamalarNow,
}) => {
  const email = currentUser?.email || 'kampci';
  const [panelView, setPanelView] = useState<PanelView>('taseron');
  const [selectedFirma, setSelectedFirma] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyEksik, setShowOnlyEksik] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const anaFirmaPersonelleri = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const matchSearch = (p: Personel) => {
      if (!q) return true;
      const blob = `${p.ad} ${p.soyad} ${p.gorev || ''} ${p.departman || ''} ${p.tcNo || ''}`.toLocaleLowerCase('tr-TR');
      return blob.includes(q);
    };

    return personeller
      .filter(isAnaFirmaPersonel)
      .filter(personelAktif)
      .filter(matchSearch)
      .filter((p) => {
        if (!showOnlyEksik) return true;
        return eksikMyk(p);
      })
      .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));
  }, [personeller, searchQuery, showOnlyEksik]);

  const firmaPersonelleri = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const matchSearch = (p: Personel) => {
      if (!q) return true;
      const blob = `${p.ad} ${p.soyad} ${p.gorev || ''} ${p.tcNo || ''} ${p.telefonNo || ''} ${p.firmaAdi || ''}`.toLocaleLowerCase('tr-TR');
      return blob.includes(q);
    };

    if (panelView === 'eksik_myk') {
      return personeller
        .filter(isTaseronPersonel)
        .filter(personelAktif)
        .filter((p) => personHasEksik(p))
        .filter((p) => !selectedFirma || firmaEslesir(p.firmaAdi || '', selectedFirma))
        .filter(matchSearch)
        .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));
    }

    if (!selectedFirma) return [];
    return personeller
      .filter((p) => isTaseronPersonel(p) && firmaEslesir(p.firmaAdi || '', selectedFirma))
      .filter(matchSearch)
      .filter((p) => {
        if (!showOnlyEksik) return true;
        return personHasEksik(p);
      })
      .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));
  }, [personeller, selectedFirma, searchQuery, showOnlyEksik, panelView]);

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

  const handleAnaFirmaMykChange = (personel: Personel, mykDurumu: 'VAR' | 'YOK' | 'BILINMIYOR') => {
    if (mykDurumu === (personel.mykDurumu || 'BILINMIYOR')) {
      showStatus?.('info', 'MYK durumu zaten aynı.');
      return;
    }

    const { patch, error } = buildPersonelPatchFromDraft(personel, {
      tcNo: digitsOnly(personel.tcNo || ''),
      telefonNo: String(personel.telefonNo || '').trim(),
      mykDurumu,
    });
    if (error || !patch) {
      showStatus?.('error', error || 'MYK güncellenemedi.');
      return;
    }

    setPendingPatches((prev) => mergePendingPatches(prev, patch));
    const islem = buildSessionIslemFromPatch(sessionId, CANONICAL_ANA_FIRMA_ADI, patch, email);
    setSessionIslemler((prev) => [...prev, islem]);
    showStatus?.(
      'success',
      `${personel.ad} ${personel.soyad} MYK (${mykDurumu}) taslağa eklendi. Onaya Gönder ile yöneticiye iletin.`
    );
  };

  const handleSavePerson = (personel: Personel) => {
    const draft = getDraft(personel);
    const { patch, error } = buildPersonelPatchFromDraft(personel, draft);
    if (error || !patch) {
      showStatus?.('error', error || 'Kaydedilecek değişiklik yok.');
      return;
    }

    setPendingPatches((prev) => mergePendingPatches(prev, patch));
    const firma = selectedFirma || String(personel.firmaAdi || '').trim();
    const islem = buildSessionIslemFromPatch(sessionId, firma, patch, email);
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
    const firma = selectedFirma || String(personel.firmaAdi || '').trim();
    const islem = buildSessionIslemFromPatch(sessionId, firma, patch, email);
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
    const personelGuncellemeleri = Object.values(pendingPatches) as KampTaseronSayimPersonelGuncelleme[];
    const firstPerson = personeller.find((p) => p.id === personelGuncellemeleri[0]?.personelId);
    const effectiveFirma =
      panelView === 'ana_firma'
        ? CANONICAL_ANA_FIRMA_ADI
        : selectedFirma.trim() || String(firstPerson?.firmaAdi || '').trim() || '';

    if (!effectiveFirma) {
      showStatus?.('error', 'Önce taşeron firma seçin veya en az bir taslak kayıt oluşturun.');
      return;
    }
    const validation = validateTaseronSayimSession({
      firmaAdi: effectiveFirma,
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
        firmaAdi: effectiveFirma,
        tarih: new Date().toISOString().slice(0, 10),
        baslangic: sessionIslemler[0]?.tarih || new Date().toISOString(),
        bitis: new Date().toISOString(),
        yapan: email,
        islemSayisi: personelGuncellemeleri.length,
        durum: 'BEKLEMEDE',
        personelGuncellemeleri,
        ozet: {
          toplamPersonel:
            panelView === 'ana_firma' ? anaFirmaPersonelleri.length : firmaPersonelleri.length,
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
        `${effectiveFirma} taşeron sayımı yönetici onayına gönderildi · ${personelGuncellemeleri.length} güncelleme`
      );
    } catch (err) {
      console.error(err);
      showStatus?.('error', 'Sayım kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSavingSession(false);
    }
  };

  const eksikSayisi = firmaPersonelleri.filter((p) => personHasEksik(p)).length;

  const removePendingPatch = (personelId: string) => {
    setPendingPatches((prev) => {
      const next = { ...prev };
      delete next[personelId];
      return next;
    });
    setSessionIslemler((prev) => prev.filter((i) => i.personelId !== personelId || i.islemTipi === 'ISTEN_CIKIS'));
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[personelId];
      return copy;
    });
    if (editingId === personelId) setEditingId(null);
    showStatus?.('info', 'Taslak güncelleme listeden kaldırıldı.');
  };

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
      {/* Panel seçimi */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'taseron' as const, label: 'Taşeron Sayım', icon: Building2 },
            { id: 'eksik_myk' as const, label: 'Eksik Bilgi / MYK', icon: AlertTriangle },
            { id: 'ana_firma' as const, label: 'Ana Firma MYK', icon: Calendar },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (tab.id !== panelView) {
                resetSession();
                setSearchQuery('');
                setShowOnlyEksik(false);
                if (tab.id !== 'taseron') setSelectedFirma('');
              }
              setPanelView(tab.id);
              setEditingId(null);
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black border cursor-pointer transition ${
              panelView === tab.id
                ? tab.id === 'ana_firma'
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : tab.id === 'eksik_myk'
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-amber-600 border-amber-500 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {panelView === 'ana_firma' ? (
        <div className="space-y-4">
          <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-100">
                  <Calendar className="text-emerald-700" size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{CANONICAL_ANA_FIRMA_ADI} — MYK Yoklama</h3>
                  <p className="text-xs text-slate-500">
                    Yalnızca MYK (Var / Yok / Bilinmiyor) işaretlenir. TC, telefon veya işten çıkarma bu ekranda yapılamaz.
                  </p>
                </div>
              </div>
              {pendingPatchCount > 0 && (
                <button
                  type="button"
                  onClick={handleSaveSession}
                  disabled={savingSession}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
                >
                  {savingSession ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  MYK Onaya Gönder ({pendingPatchCount})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Personel Ara</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ad, görev, departman..."
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
                  Sadece MYK eksik olanlar
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-bold">
              <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
                <Users size={12} className="inline mr-1" />
                {anaFirmaPersonelleri.length} aktif personel
              </span>
              <span className="px-2 py-1 rounded-lg bg-violet-50 text-violet-800">
                <AlertTriangle size={12} className="inline mr-1" />
                {anaFirmaPersonelleri.filter(eksikMyk).length} MYK eksik
              </span>
              <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800">
                <CheckCircle2 size={12} className="inline mr-1" />
                {pendingPatchCount} taslak MYK
              </span>
            </div>
          </div>

          {anaFirmaPersonelleri.length === 0 ? (
            <div className="text-center p-12 text-slate-500 italic bg-white border border-slate-200 rounded-2xl">
              Aktif ana firma personeli bulunamadı.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-emerald-50 text-slate-700">
                      <th className="p-2 text-left font-black">Ad Soyad</th>
                      <th className="p-2 text-left font-black">Görev</th>
                      <th className="p-2 text-left font-black hidden md:table-cell">Departman</th>
                      <th className="p-2 text-center font-black">Mevcut MYK</th>
                      <th className="p-2 text-center font-black">MYK İşaretle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anaFirmaPersonelleri.map((p) => {
                      const pendingMyk = pendingPatches[p.id]?.mykDurumu;
                      const currentMyk = pendingMyk ?? p.mykDurumu ?? 'BILINMIYOR';
                      const mykE = eksikMyk(p) && !pendingMyk;
                      const taslakVar = Boolean(pendingPatches[p.id]);

                      return (
                        <tr
                          key={p.id}
                          className={`border-t border-slate-100 hover:bg-slate-50/80 ${mykE ? 'bg-violet-50/30' : ''}`}
                        >
                          <td className="p-2">
                            <div className="font-bold text-slate-900">
                              {p.ad} {p.soyad}
                            </div>
                            {taslakVar && (
                              <span className="text-[9px] font-black text-sky-700">MYK TASLAK</span>
                            )}
                          </td>
                          <td className="p-2 text-slate-600">{p.gorev || '—'}</td>
                          <td className="p-2 text-slate-500 hidden md:table-cell">{p.departman || '—'}</td>
                          <td className="p-2 text-center">
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                currentMyk === 'VAR'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : currentMyk === 'YOK'
                                    ? 'bg-slate-200 text-slate-700'
                                    : 'bg-violet-100 text-violet-800'
                              }`}
                            >
                              {currentMyk === 'VAR' ? 'VAR' : currentMyk === 'YOK' ? 'YOK' : '?'}
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="flex justify-center gap-1">
                              {(['VAR', 'YOK', 'BILINMIYOR'] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => handleAnaFirmaMykChange(p, v)}
                                  className={`px-2 py-1 rounded-lg text-[9px] font-black border cursor-pointer ${
                                    currentMyk === v
                                      ? 'bg-emerald-700 text-white border-emerald-700'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {v === 'VAR' ? 'VAR' : v === 'YOK' ? 'YOK' : '?'}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${panelView === 'eksik_myk' ? 'bg-violet-100' : 'bg-amber-100'}`}>
              <ClipboardList className={panelView === 'eksik_myk' ? 'text-violet-700' : 'text-amber-700'} size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">
                {panelView === 'eksik_myk' ? 'Eksik Bilgi / MYK Listesi' : 'Taşeron Sayım'}
              </h3>
              <p className="text-xs text-slate-500">
                {panelView === 'eksik_myk'
                  ? 'Aktif taşeron personelde TC · telefon · MYK eksikleri · arama ve düzenleme'
                  : 'Taşeron firma personel listesi · eksik evrak · MYK · işe giriş/çıkış'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {panelView === 'taseron' && (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">
              Taşeron Firma {panelView === 'taseron' && <span className="text-red-600">*</span>}
            </label>
            <select
              value={selectedFirma}
              onChange={(e) => {
                setSelectedFirma(e.target.value);
                setEditingId(null);
              }}
              className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none"
            >
              <option value="">{panelView === 'eksik_myk' ? '— Tüm Taşeron Firmalar —' : '— Firma Seçin —'}</option>
              {firmaOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Personel Ara</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ad, TC, telefon, görev, firma..."
                className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 pl-9 pr-3 py-2.5 rounded-xl outline-none"
              />
            </div>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            {panelView === 'taseron' && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyEksik}
                  onChange={(e) => setShowOnlyEksik(e.target.checked)}
                  className="rounded"
                />
                Sadece eksik evraklılar
              </label>
            )}
            {panelView === 'eksik_myk' && (
              <>
                <span className="text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                  Yalnızca aktif · MYK, TC veya telefon eksik
                </span>
                {pendingPatchCount > 0 && (
                  <button
                    type="button"
                    onClick={handleSaveSession}
                    disabled={savingSession}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-bold disabled:opacity-40"
                  >
                    {savingSession ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Onaya Gönder ({pendingPatchCount})
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {panelView === 'taseron' && selectedFirma && (
          <div className="mt-4 space-y-2">
            {bekleyenFirmaSayimi && (
              <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
                <Clock size={12} />
                Bu firma için yönetici onayı bekleyen sayım var ({bekleyenFirmaSayimi.islemSayisi} güncelleme).
              </p>
            )}
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
            </div>
          </div>
        )}

          {panelView === 'eksik_myk' && (
          <p className="mt-4 text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
            {firmaPersonelleri.length} aktif personel · {firmaPersonelleri.filter(eksikMyk).length} MYK eksik ·{' '}
            {firmaPersonelleri.filter(eksikTc).length} TC eksik · {firmaPersonelleri.filter(eksikTel).length} tel eksik
          </p>
        )}
      </div>

      {/* Yapılan işlemler listesi */}
      {(pendingPatchCount > 0 || sessionIslemler.length > 0) && panelView === 'taseron' && (
        <div className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm">
          <h4 className="text-xs font-black uppercase text-sky-900 mb-3 flex items-center gap-2">
            <ClipboardList size={14} />
            Bu Oturumdaki İşlemler ({pendingPatchCount + sessionIslemler.filter((i) => i.islemTipi === 'ISTEN_CIKIS').length})
          </h4>
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left p-2 font-bold">Personel</th>
                  <th className="text-left p-2 font-bold">İşlem</th>
                  <th className="text-left p-2 font-bold hidden sm:table-cell">Detay</th>
                  <th className="text-right p-2 font-bold w-20">Sil</th>
                </tr>
              </thead>
              <tbody>
                {(Object.values(pendingPatches) as KampTaseronSayimPersonelGuncelleme[]).map((patch) => (
                  <tr key={patch.personelId} className="border-t border-slate-100">
                    <td className="p-2 font-bold text-slate-800">{patch.personelIsim}</td>
                    <td className="p-2 text-sky-800 font-semibold">Taslak güncelleme</td>
                    <td className="p-2 text-slate-500 hidden sm:table-cell">{patch.detay || '—'}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => removePendingPatch(patch.personelId)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-bold cursor-pointer"
                        title="Taslaktan kaldır"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {sessionIslemler
                  .filter((i) => i.islemTipi === 'ISTEN_CIKIS')
                  .map((islem) => (
                    <tr key={islem.id} className="border-t border-slate-100">
                      <td className="p-2 font-bold text-slate-800">{islem.personelIsim}</td>
                      <td className="p-2 text-red-700 font-semibold">İşten çıkış talebi</td>
                      <td className="p-2 text-slate-500 hidden sm:table-cell">{islem.detay}</td>
                      <td className="p-2 text-right text-slate-400 text-[9px]">Onay kuyruğu</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {panelView === 'taseron' && !selectedFirma ? (
        <div className="text-center p-12 text-slate-500 italic bg-white border border-slate-200 rounded-2xl">
          Sayıma başlamak için taşeron firma seçin.
        </div>
      ) : firmaPersonelleri.length === 0 ? (
        <div className="text-center p-12 text-slate-500 italic bg-white border border-slate-200 rounded-2xl">
          {panelView === 'eksik_myk' ? 'Eksik bilgili aktif taşeron personel bulunamadı.' : 'Bu firmaya bağlı personel bulunamadı.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="p-2 text-left font-black">Ad Soyad</th>
                  <th className="p-2 text-left font-black hidden md:table-cell">Firma</th>
                  <th className="p-2 text-left font-black">Görev</th>
                  <th className="p-2 text-center font-black">TC</th>
                  <th className="p-2 text-center font-black hidden sm:table-cell">Tel</th>
                  <th className="p-2 text-center font-black">MYK</th>
                  <th className="p-2 text-center font-black">Durum</th>
                  <th className="p-2 text-center font-black">Eksik</th>
                  <th className="p-2 text-right font-black">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {firmaPersonelleri.map((p) => {
                  const draft = getDraft(p);
                  const tcE = eksikTc(p);
                  const telE = eksikTel(p);
                  const mykE = eksikMyk(p);
                  const aktif = personelAktif(p);
                  const busy = savingId === p.id;
                  const cikisOnayBekliyor = pendingCikisPersonelIds.has(p.id);
                  const taslakVar = Boolean(pendingPatches[p.id]);
                  const isEditing = editingId === p.id;

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`border-t border-slate-100 hover:bg-slate-50/80 ${
                          tcE || telE || mykE ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="p-2">
                          <div className="font-bold text-slate-900">{p.ad} {p.soyad}</div>
                          {taslakVar && (
                            <span className="text-[9px] font-black text-sky-700">TASLAK</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-600 hidden md:table-cell">{p.firmaAdi || '—'}</td>
                        <td className="p-2 text-slate-600">{p.gorev || '—'}</td>
                        <td className="p-2 text-center font-mono text-[10px]">{draft.tcNo || '—'}</td>
                        <td className="p-2 text-center font-mono text-[10px] hidden sm:table-cell">{draft.telefonNo || '—'}</td>
                        <td className="p-2 text-center">
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                              draft.mykDurumu === 'VAR'
                                ? 'bg-emerald-100 text-emerald-800'
                                : draft.mykDurumu === 'YOK'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-violet-100 text-violet-800'
                            }`}
                          >
                            {draft.mykDurumu === 'VAR' ? 'VAR' : draft.mykDurumu === 'YOK' ? 'YOK' : '?'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                              aktif ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {aktif ? 'AKTİF' : 'PASİF'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex flex-wrap justify-center gap-0.5">
                            {tcE && <span className="text-[8px] font-black bg-red-100 text-red-700 px-1 rounded">TC</span>}
                            {telE && <span className="text-[8px] font-black bg-orange-100 text-orange-700 px-1 rounded">TEL</span>}
                            {mykE && <span className="text-[8px] font-black bg-violet-100 text-violet-700 px-1 rounded">MYK</span>}
                            {!tcE && !telE && !mykE && <span className="text-slate-300">—</span>}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingId(isEditing ? null : p.id)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                              title="Düzenle"
                            >
                              {isEditing ? <X size={13} /> : <Edit3 size={13} />}
                            </button>
                            {panelView === 'taseron' && aktif && (
                              <button
                                type="button"
                                disabled={busy || cikisOnayBekliyor}
                                onClick={() => handleIstenCikis(p)}
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer disabled:opacity-40"
                                title="İşten çıkar"
                              >
                                <LogOut size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr className="bg-sky-50/50 border-t border-sky-100">
                          <td colSpan={9} className="p-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                              <div>
                                <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">TC</label>
                                <input
                                  value={draft.tcNo}
                                  onChange={(e) => patchDraft(p.id, { tcNo: digitsOnly(e.target.value).slice(0, 11) })}
                                  className="w-full border text-xs p-2 rounded-xl bg-white border-slate-200"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Telefon</label>
                                <input
                                  value={draft.telefonNo}
                                  onChange={(e) => patchDraft(p.id, { telefonNo: e.target.value })}
                                  className="w-full border text-xs p-2 rounded-xl bg-white border-slate-200"
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
                                        draft.mykDurumu === v ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'
                                      }`}
                                    >
                                      {v === 'VAR' ? 'VAR' : v === 'YOK' ? 'YOK' : '?'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {aktif ? (
                                <button
                                  type="button"
                                  disabled={busy || cikisOnayBekliyor}
                                  onClick={() => handleIstenCikis(p)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-600 text-white text-[10px] font-black disabled:opacity-50"
                                >
                                  <LogOut size={12} /> İşten Çıkar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleIseGiris(p)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black"
                                >
                                  <UserCheck size={12} /> İşe Al (Taslak)
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  handleSavePerson(p);
                                  setEditingId(null);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-sky-700 text-white text-[10px] font-black"
                              >
                                <Save size={12} /> Taslağa Kaydet
                              </button>
                              {taslakVar && (
                                <button
                                  type="button"
                                  onClick={() => removePendingPatch(p.id)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-black"
                                >
                                  <Trash2 size={12} /> Taslağı Sil
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
