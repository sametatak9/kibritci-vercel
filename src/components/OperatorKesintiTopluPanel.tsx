/**
 * Operatör faaliyet / taşeron kesinti — toplu inceleme ve düzeltme.
 * Operatör saha girerken «Taşeron kesintisi» ayrımını atladıysa yönetici buradan
 * tüm kayıtları görüp firma / makine kaynağı / kesinti bağını düzeltir.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckSquare,
  ClipboardList,
  HardHat,
  Save,
  Square,
  Search,
} from 'lucide-react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import type {
  CariKart,
  OperatorFaaliyet,
  OperatorSahaFaaliyet,
} from '../types/erp';
import { db, cleanUndefined } from '../lib/firebase';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import { normalizeDateKey, todayDateKey } from '../lib/dateKeyUtils';
import {
  buildOperatorIsKaydiEtiketi,
  getTaseronCariKartlar,
  makineEtiketi,
} from '../lib/taseronUtils';

type Props = {
  cariKartlar: CariKart[];
  operatorFaaliyetleri: OperatorFaaliyet[];
  setOperatorFaaliyetleri: React.Dispatch<React.SetStateAction<OperatorFaaliyet[]>>;
  currentUser: { email?: string } | null;
};

type AltSekme = 'kesinti' | 'saha';

const AYLAR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

function pendingOf(f: OperatorFaaliyet): boolean {
  if (f.onayDurumu === 'ONAYLANDI' || f.onayDurumu === 'REDDEDİLDİ') return false;
  if (f.durum === 'ONAYLANDI' || f.durum === 'REDDEDİLDİ') return false;
  return true;
}

function sahaSorunlu(f: OperatorSahaFaaliyet): boolean {
  if (f.faaliyetGrubu !== 'MESAI') return false;
  return !f.taseronKesinti || !f.taseronFirmaId;
}

export const OperatorKesintiTopluPanel: React.FC<Props> = ({
  cariKartlar,
  operatorFaaliyetleri,
  setOperatorFaaliyetleri,
  currentUser,
}) => {
  const now = todayDateKey();
  const [alt, setAlt] = useState<AltSekme>('kesinti');
  const [ay, setAy] = useState(Number(now.slice(5, 7)));
  const [yil, setYil] = useState(Number(now.slice(0, 4)));
  const [q, setQ] = useState('');
  const [filtreFirma, setFiltreFirma] = useState('');
  const [sadeceSorunlu, setSadeceSorunlu] = useState(true);
  const [sadeceBekleyen, setSadeceBekleyen] = useState(false);
  const [seciliKesinti, setSeciliKesinti] = useState<Set<string>>(new Set());
  const [seciliSaha, setSeciliSaha] = useState<Set<string>>(new Set());
  const [topluFirmaId, setTopluFirmaId] = useState('');
  const [topluKaynak, setTopluKaynak] = useState<'' | 'DEMIRBAS' | 'KIRALIK' | 'MANUEL'>('');
  const [busy, setBusy] = useState(false);
  const [sahaList, setSahaList] = useState<OperatorSahaFaaliyet[]>([]);
  const [msg, setMsg] = useState('');

  const taseronCariler = useMemo(() => getTaseronCariKartlar(cariKartlar), [cariKartlar]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'operatorSahaFaaliyetleri'), (snap) => {
      setSahaList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OperatorSahaFaaliyet)));
    });
    return () => unsub();
  }, []);

  const kesintiFiltreli = useMemo(() => {
    const qq = q.trim().toLocaleLowerCase('tr-TR');
    return operatorFaaliyetleri
      .filter((f) => {
        const dk = normalizeDateKey(f.tarih);
        if (!dk) return false;
        const [yy, mm] = dk.split('-').map(Number);
        if (yy !== yil || mm !== ay) return false;
        if (filtreFirma && f.firmaAdi !== filtreFirma) return false;
        if (sadeceBekleyen && !pendingOf(f)) return false;
        if (sadeceSorunlu) {
          const firmaBos = !String(f.firmaAdi || '').trim() || !f.firmaId;
          const cariYok =
            Boolean(f.firmaAdi) &&
            !taseronCariler.some(
              (c) =>
                c.id === f.firmaId ||
                c.unvan.toLocaleLowerCase('tr-TR') === f.firmaAdi.toLocaleLowerCase('tr-TR')
            );
          if (!firmaBos && !cariYok) return false;
        }
        if (qq) {
          const hay = `${f.yapilanIs} ${f.firmaAdi} ${f.operatorIsim} ${f.aracPlaka || ''} ${f.isKaydiEtiketi || ''}`
            .toLocaleLowerCase('tr-TR');
          if (!hay.includes(qq)) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
  }, [
    operatorFaaliyetleri,
    ay,
    yil,
    q,
    filtreFirma,
    sadeceBekleyen,
    sadeceSorunlu,
    taseronCariler,
  ]);

  const sahaFiltreli = useMemo(() => {
    const qq = q.trim().toLocaleLowerCase('tr-TR');
    return sahaList
      .filter((f) => {
        const dk = normalizeDateKey(f.tarih);
        if (!dk) return false;
        const [yy, mm] = dk.split('-').map(Number);
        if (yy !== yil || mm !== ay) return false;
        if (filtreFirma && f.taseronFirmaAdi !== filtreFirma) return false;
        if (sadeceSorunlu && !sahaSorunlu(f)) return false;
        if (sadeceBekleyen && String(f.durum || '').toUpperCase().includes('ONAYLANDI')) return false;
        if (qq) {
          const hay = `${f.aciklama} ${f.isNiteligi} ${f.taseronFirmaAdi || ''} ${f.parsel} ${f.blok}`
            .toLocaleLowerCase('tr-TR');
          if (!hay.includes(qq)) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
  }, [sahaList, ay, yil, q, filtreFirma, sadeceSorunlu, sadeceBekleyen]);

  const firmalarDonem = useMemo(() => {
    const set = new Set<string>();
    for (const f of operatorFaaliyetleri) {
      const dk = normalizeDateKey(f.tarih);
      if (!dk) continue;
      const [yy, mm] = dk.split('-').map(Number);
      if (yy === yil && mm === ay && f.firmaAdi) set.add(f.firmaAdi);
    }
    for (const f of sahaList) {
      const dk = normalizeDateKey(f.tarih);
      if (!dk) continue;
      const [yy, mm] = dk.split('-').map(Number);
      if (yy === yil && mm === ay && f.taseronFirmaAdi) set.add(f.taseronFirmaAdi);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [operatorFaaliyetleri, sahaList, ay, yil]);

  const toggleAllKesinti = () => {
    if (seciliKesinti.size === kesintiFiltreli.length) {
      setSeciliKesinti(new Set());
    } else {
      setSeciliKesinti(new Set(kesintiFiltreli.map((f) => f.id)));
    }
  };

  const toggleAllSaha = () => {
    if (seciliSaha.size === sahaFiltreli.length) {
      setSeciliSaha(new Set());
    } else {
      setSeciliSaha(new Set(sahaFiltreli.map((f) => f.id)));
    }
  };

  const applyKesintiToplu = async () => {
    if (seciliKesinti.size === 0) {
      setMsg('Önce kayıt seçin.');
      return;
    }
    if (!topluFirmaId && !topluKaynak) {
      setMsg('Taşeron firma ve/veya makine kaynağı seçin.');
      return;
    }
    const cari = taseronCariler.find((c) => c.id === topluFirmaId);
    if (topluFirmaId && !cari) {
      setMsg('Geçerli taşeron seçin.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const block = await assertErpWriteAuth();
      if (block) {
        setMsg(block);
        return;
      }
      const ids = [...seciliKesinti];
      const patchBase: Partial<OperatorFaaliyet> = {};
      if (cari) {
        patchBase.firmaId = cari.id;
        patchBase.firmaAdi = cari.unvan;
        patchBase.isManualFirma = false;
      }
      if (topluKaynak) {
        patchBase.makineKaynak = topluKaynak;
      }
      await Promise.all(
        ids.map(async (id) => {
          const prev = operatorFaaliyetleri.find((f) => f.id === id);
          const nextPatch = { ...patchBase };
          if (topluKaynak && prev) {
            nextPatch.isKaydiEtiketi = buildOperatorIsKaydiEtiketi({
              makineKaynak: topluKaynak,
              operatorTipi: prev.operatorTipi,
              makineManuelAd: prev.makineManuelAd,
              aracPlaka: prev.aracPlaka,
            });
          }
          await updateDoc(doc(db, 'operatorFaaliyetleri', id), cleanUndefined(nextPatch) as any);
        })
      );
      setOperatorFaaliyetleri((prev) =>
        prev.map((f) => {
          if (!seciliKesinti.has(f.id)) return f;
          const next = { ...f, ...patchBase };
          if (topluKaynak) {
            next.makineKaynak = topluKaynak;
            next.isKaydiEtiketi = buildOperatorIsKaydiEtiketi({
              makineKaynak: topluKaynak,
              operatorTipi: f.operatorTipi,
              makineManuelAd: f.makineManuelAd,
              aracPlaka: f.aracPlaka,
            });
          }
          return next;
        })
      );
      setMsg(`${ids.length} kesinti kaydı güncellendi.`);
      setSeciliKesinti(new Set());
    } catch (err) {
      setMsg(formatFirestoreWriteError(err));
    } finally {
      setBusy(false);
    }
  };

  const applySahaKesintiBagla = async () => {
    if (seciliSaha.size === 0) {
      setMsg('Önce saha faaliyeti seçin.');
      return;
    }
    const cari = taseronCariler.find((c) => c.id === topluFirmaId);
    if (!cari) {
      setMsg('Kesinti bağlamak için taşeron firma seçin.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const block = await assertErpWriteAuth();
      if (block) {
        setMsg(block);
        return;
      }
      const email = String(currentUser?.email || '').trim().toLowerCase();
      let created = 0;
      let updated = 0;
      const yeniOf: OperatorFaaliyet[] = [];

      for (const sid of seciliSaha) {
        const saha = sahaList.find((f) => f.id === sid);
        if (!saha) continue;
        const mesaiMap = saha.personelMesaiSaatleri || {};
        const toplamSaat = (Object.values(mesaiMap) as number[]).reduce(
          (s, h) => s + Number(h || 0),
          0
        );
        const ofId =
          saha.bagliOperatorFaaliyetId ||
          `of_mesai_fix_${sid}`;
        const existingOf = operatorFaaliyetleri.find((f) => f.id === ofId);
        const isKaydiEtiketi =
          saha.isKaydiEtiketi ||
          buildOperatorIsKaydiEtiketi({
            makineKaynak: saha.makineKaynak || 'DEMIRBAS',
            operatorTipi: (saha.operatorTipi as OperatorFaaliyet['operatorTipi']) || 'DİĞER',
            makineManuelAd: saha.makineManuelAd,
            aracPlaka: saha.aracPlaka,
          });

        const ofPayload: OperatorFaaliyet = {
          id: ofId,
          aracId: saha.aracId || 'mesai_saha',
          aracPlaka: saha.aracPlaka || 'MESAİ SAHA',
          operatorPersonelId: saha.aktifPersonelListesi?.[0],
          operatorIsim: existingOf?.operatorIsim || email || 'Operatör',
          operatorTipi: (saha.operatorTipi as OperatorFaaliyet['operatorTipi']) || 'DİĞER',
          tarih: normalizeDateKey(saha.tarih) || saha.tarih,
          baslangicSaat: existingOf?.baslangicSaat || '17:00',
          bitisSaat: existingOf?.bitisSaat || '17:00',
          calismaSuresi:
            toplamSaat > 0
              ? Math.round(toplamSaat * 100) / 100
              : existingOf?.calismaSuresi || 0,
          yapilanIs: `[Mesai kesinti] ${saha.aciklama} · ${saha.isNiteligi} (${saha.parsel}/${saha.blok})`,
          firmaAdi: cari.unvan,
          firmaId: cari.id,
          fotoUrl: saha.fotoUrl || undefined,
          makineKaynak: saha.makineKaynak || 'MANUEL',
          makineManuelAd: saha.makineManuelAd || saha.aracPlaka || 'Mesai saha',
          isKaydiEtiketi,
          onayDurumu: existingOf?.onayDurumu || 'BEKLEMEDE',
          durum: existingOf?.durum || 'ONAY BEKLİYOR',
          kaydedenKullanici: email,
          kayitTarihi: existingOf?.kayitTarihi || new Date().toISOString(),
        };

        await setDoc(doc(db, 'operatorFaaliyetleri', ofId), cleanUndefined(ofPayload) as any, {
          merge: true,
        });
        await updateDoc(
          doc(db, 'operatorSahaFaaliyetleri', sid),
          cleanUndefined({
            taseronKesinti: true,
            taseronFirmaId: cari.id,
            taseronFirmaAdi: cari.unvan,
            bagliOperatorFaaliyetId: ofId,
            guncellenme: new Date().toISOString(),
          }) as any
        );

        if (existingOf) updated += 1;
        else {
          created += 1;
          yeniOf.push(ofPayload);
        }
      }

      setOperatorFaaliyetleri((prev) => {
        const map = new Map<string, OperatorFaaliyet>(prev.map((f) => [f.id, f]));
        for (const n of yeniOf) map.set(n.id, n);
        for (const sid of seciliSaha) {
          const saha = sahaList.find((f) => f.id === sid);
          const ofId = saha?.bagliOperatorFaaliyetId || `of_mesai_fix_${sid}`;
          const cur = map.get(ofId);
          if (cur) {
            map.set(ofId, {
              ...cur,
              firmaAdi: cari.unvan,
              firmaId: cari.id,
            });
          }
        }
        return [...map.values()];
      });

      setMsg(
        `${seciliSaha.size} saha kaydı bağlandı · ${created} yeni kesinti · ${updated} güncellendi.`
      );
      setSeciliSaha(new Set());
    } catch (err) {
      setMsg(formatFirestoreWriteError(err));
    } finally {
      setBusy(false);
    }
  };

  const updateTekKesintiFirma = async (id: string, firmaId: string) => {
    const cari = taseronCariler.find((c) => c.id === firmaId);
    if (!cari) return;
    setBusy(true);
    try {
      const block = await assertErpWriteAuth();
      if (block) {
        setMsg(block);
        return;
      }
      await updateDoc(doc(db, 'operatorFaaliyetleri', id), {
        firmaId: cari.id,
        firmaAdi: cari.unvan,
        isManualFirma: false,
      });
      setOperatorFaaliyetleri((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, firmaId: cari.id, firmaAdi: cari.unvan, isManualFirma: false } : f
        )
      );
    } catch (err) {
      setMsg(formatFirestoreWriteError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 flex items-center gap-1.5">
          <ClipboardList size={12} /> Toplu inceleme
        </p>
        <h3 className="text-sm font-black text-amber-950 mt-0.5">
          Operatör faaliyetleri — taşeron kesintisi düzeltme
        </h3>
        <p className="text-[11px] text-amber-900/80 mt-1 max-w-2xl leading-snug">
          Operatör saha girerken «Taşeron için mesai — kesinti» işaretini atladıysa veya yanlış
          firmaya yazdıysa burada dönemdeki tüm kayıtları görüp toplu düzeltirsiniz. Onay havuzuna
          düşen kesinti kayıtları ile saha faaliyetleri ayrı listelenir.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAlt('kesinti')}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase cursor-pointer ${
            alt === 'kesinti' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Kesinti kayıtları ({kesintiFiltreli.length})
        </button>
        <button
          type="button"
          onClick={() => setAlt('saha')}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase cursor-pointer ${
            alt === 'saha' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Saha faaliyetleri ({sahaFiltreli.length})
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <label className="text-[9px] font-bold uppercase text-slate-500">
          Ay
          <select
            value={ay}
            onChange={(e) => setAy(Number(e.target.value))}
            className="mt-0.5 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold"
          >
            {AYLAR.map((a, i) => (
              <option key={a} value={i + 1}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[9px] font-bold uppercase text-slate-500">
          Yıl
          <select
            value={yil}
            onChange={(e) => setYil(Number(e.target.value))}
            className="mt-0.5 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold"
          >
            {[yil - 1, yil, yil + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[9px] font-bold uppercase text-slate-500">
          Firma
          <select
            value={filtreFirma}
            onChange={(e) => setFiltreFirma(e.target.value)}
            className="mt-0.5 block min-w-[140px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold"
          >
            <option value="">Tümü</option>
            {firmalarDonem.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div className="relative flex-1 min-w-[140px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs font-semibold"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sadeceSorunlu}
            onChange={(e) => setSadeceSorunlu(e.target.checked)}
          />
          Sadece sorunlu
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sadeceBekleyen}
            onChange={(e) => setSadeceBekleyen(e.target.checked)}
          />
          Onay bekleyen
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-[9px] font-black uppercase text-slate-500">Toplu işlem</p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-[9px] font-bold uppercase text-slate-500 flex-1 min-w-[180px]">
            Taşeron firma
            <select
              value={topluFirmaId}
              onChange={(e) => setTopluFirmaId(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold"
            >
              <option value="">Seçin…</option>
              {taseronCariler.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.unvan}
                </option>
              ))}
            </select>
          </label>
          {alt === 'kesinti' && (
            <label className="text-[9px] font-bold uppercase text-slate-500">
              Makine kaynağı
              <select
                value={topluKaynak}
                onChange={(e) =>
                  setTopluKaynak(e.target.value as '' | 'DEMIRBAS' | 'KIRALIK' | 'MANUEL')
                }
                className="mt-0.5 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold"
              >
                <option value="">Değiştirme</option>
                <option value="DEMIRBAS">Demirbaş (Ana Firma)</option>
                <option value="KIRALIK">Kiralık</option>
                <option value="MANUEL">Manuel</option>
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void (alt === 'kesinti' ? applyKesintiToplu() : applySahaKesintiBagla())}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-[10px] font-black uppercase text-white disabled:opacity-50 cursor-pointer"
          >
            <Save size={12} />
            {alt === 'kesinti'
              ? `Seçilenlere uygula (${seciliKesinti.size})`
              : `Kesinti bağla (${seciliSaha.size})`}
          </button>
        </div>
        {msg && (
          <p className="text-[11px] font-semibold text-slate-700 flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
            {msg}
          </p>
        )}
      </div>

      {alt === 'kesinti' ? (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 bg-slate-50">
            <button
              type="button"
              onClick={toggleAllKesinti}
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-700 cursor-pointer"
            >
              {seciliKesinti.size === kesintiFiltreli.length && kesintiFiltreli.length > 0 ? (
                <CheckSquare size={14} />
              ) : (
                <Square size={14} />
              )}
              Tümünü seç ({kesintiFiltreli.length})
            </button>
            <span className="text-[10px] text-slate-500 font-semibold">
              {seciliKesinti.size} seçili
            </span>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
            {kesintiFiltreli.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">
                Bu filtrede kesinti kaydı yok. «Sadece sorunlu»yu kapatıp tümünü görebilirsiniz.
              </p>
            ) : (
              kesintiFiltreli.map((f) => {
                const checked = seciliKesinti.has(f.id);
                const firmaSorun =
                  !f.firmaId ||
                  !taseronCariler.some((c) => c.id === f.firmaId || c.unvan === f.firmaAdi);
                return (
                  <div
                    key={f.id}
                    className={`p-3 flex gap-3 ${checked ? 'bg-rose-50/50' : 'bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSeciliKesinti((prev) => {
                          const n = new Set(prev);
                          if (n.has(f.id)) n.delete(f.id);
                          else n.add(f.id);
                          return n;
                        });
                      }}
                      className="shrink-0 mt-1 cursor-pointer text-slate-600"
                    >
                      {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="bg-amber-100 text-amber-900 text-[9px] font-black px-2 py-0.5 rounded-full">
                          {f.isKaydiEtiketi || makineEtiketi(f)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{f.tarih}</span>
                        {firmaSorun && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                            Firma sorunlu
                          </span>
                        )}
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            pendingOf(f)
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {pendingOf(f) ? 'Onay bekliyor' : f.onayDurumu || f.durum}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 leading-snug">{f.yapilanIs}</p>
                      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <HardHat size={10} /> {f.operatorIsim}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 size={10} /> {f.firmaAdi || '—'}
                        </span>
                        <span>
                          {f.calismaSuresi.toFixed(1)} sa · {f.makineKaynak || '—'}
                        </span>
                      </div>
                      <label className="block text-[9px] font-bold uppercase text-slate-500 max-w-sm">
                        Taşeron düzelt
                        <select
                          value={
                            taseronCariler.find((c) => c.id === f.firmaId)?.id ||
                            taseronCariler.find((c) => c.unvan === f.firmaAdi)?.id ||
                            ''
                          }
                          disabled={busy}
                          onChange={(e) => void updateTekKesintiFirma(f.id, e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold"
                        >
                          <option value="">Seçin…</option>
                          {taseronCariler.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.unvan}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 bg-slate-50">
            <button
              type="button"
              onClick={toggleAllSaha}
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-700 cursor-pointer"
            >
              {seciliSaha.size === sahaFiltreli.length && sahaFiltreli.length > 0 ? (
                <CheckSquare size={14} />
              ) : (
                <Square size={14} />
              )}
              Tümünü seç ({sahaFiltreli.length})
            </button>
            <span className="text-[10px] text-slate-500 font-semibold">
              MESAİ + kesinti eksik olanlar vurgulu
            </span>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
            {sahaFiltreli.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">
                Bu filtrede saha faaliyeti yok.
              </p>
            ) : (
              sahaFiltreli.map((f) => {
                const checked = seciliSaha.has(f.id);
                const sorun = sahaSorunlu(f);
                return (
                  <div
                    key={f.id}
                    className={`p-3 flex gap-3 ${checked ? 'bg-amber-50/70' : 'bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSeciliSaha((prev) => {
                          const n = new Set(prev);
                          if (n.has(f.id)) n.delete(f.id);
                          else n.add(f.id);
                          return n;
                        });
                      }}
                      className="shrink-0 mt-1 cursor-pointer text-slate-600"
                    >
                      {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            f.faaliyetGrubu === 'MESAI'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {f.faaliyetGrubu === 'MESAI' ? 'MESAİ' : 'NORMAL'} · {f.isNiteligi}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{f.tarih}</span>
                        {sorun ? (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                            Kesinti yok
                          </span>
                        ) : f.taseronKesinti ? (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            Kesinti bağlı
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs font-bold text-slate-800">{f.aciklama}</p>
                      <p className="text-[10px] text-slate-500">
                        {f.parsel} / {f.blok}
                        {f.taseronFirmaAdi ? ` · Taşeron: ${f.taseronFirmaAdi}` : ''}
                        {f.bagliOperatorFaaliyetId
                          ? ` · OF: ${f.bagliOperatorFaaliyetId}`
                          : ''}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorKesintiTopluPanel;
