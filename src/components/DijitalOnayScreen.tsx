import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeYetki } from '../lib/yetkiUtils';
import { PenTool, Check, X, FileText, Search, ShieldCheck, Stamp, BadgeCheck, Ban } from 'lucide-react';

/**
 * DİJİTAL ONAY — bağımsız dijital imzalama sekmesi.
 *
 * Amaç: Programın ürettiği evrakları (tutanak, fatura, irsaliye, YZ analiz raporu)
 * giriş yapmış yöneticinin KENDİ yetkisi/unvanı ile DİJİTAL olarak imzalaması ya da reddetmesi.
 *
 * Kurallar:
 * - Kaynak evraklar SALT OKUNUR okunur; bu sekme onları DEĞİŞTİRMEZ.
 * - Dijital imzalar ayrı `dijitalImzalar` koleksiyonuna yazılır — ıslak/fiili imza sistemine karışmaz.
 * - Yalnızca dijital imza veya dijital red verilebilir (veri değişikliği yapılamaz).
 */

interface DijitalOnayScreenProps {
  currentUser: any;
  kullanicilar: any[];
}

type BelgeTuru = 'TUTANAK' | 'FATURA' | 'İRSALİYE' | 'ANALİZ RAPORU';

interface Belge {
  key: string;
  belgeTuru: BelgeTuru;
  belgeId: string;
  belgeNo: string;
  tarih: string;
  muhatap: string;
  baslik: string;
}

interface DijitalImza {
  id: string;
  belgeTuru: string;
  belgeId: string;
  belgeNo?: string;
  imzalayanEmail: string;
  imzalayanAdSoyad?: string;
  imzalayanUnvan?: string;
  durum: 'IMZALANDI' | 'REDDEDILDI';
  imzaGorseli?: string | null;
  imzaText?: string;
  tarih: string;
}

const TUR_RENK: Record<BelgeTuru, string> = {
  TUTANAK: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  FATURA: 'bg-stone-200 text-stone-800 border-stone-300',
  'İRSALİYE': 'bg-amber-100 text-amber-800 border-amber-200',
  'ANALİZ RAPORU': 'bg-violet-100 text-violet-800 border-violet-200',
};

export const DijitalOnayScreen: React.FC<DijitalOnayScreenProps> = ({ currentUser, kullanicilar }) => {
  const [tutanaklar, setTutanaklar] = useState<any[]>([]);
  const [faturalar, setFaturalar] = useState<any[]>([]);
  const [irsaliyeler, setIrsaliyeler] = useState<any[]>([]);
  const [analizRaporlari, setAnalizRaporlari] = useState<any[]>([]);
  const [dijitalImzalar, setDijitalImzalar] = useState<DijitalImza[]>([]);
  const [search, setSearch] = useState('');
  const [turFilter, setTurFilter] = useState<'HEPSI' | BelgeTuru>('HEPSI');
  const [durumFilter, setDurumFilter] = useState<'HEPSI' | 'IMZASIZ' | 'IMZALI'>('HEPSI');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // ── Salt okunur abonelikler ──
  useEffect(() => {
    const subs = [
      onSnapshot(collection(db, 'hazirTutanaklar'), (s) => {
        const l: any[] = []; s.forEach((d) => l.push({ id: d.id, ...d.data() })); setTutanaklar(l);
      }),
      onSnapshot(collection(db, 'faturalar'), (s) => {
        const l: any[] = []; s.forEach((d) => l.push({ id: d.id, ...d.data() })); setFaturalar(l);
      }),
      onSnapshot(collection(db, 'irsaliyeler'), (s) => {
        const l: any[] = []; s.forEach((d) => l.push({ id: d.id, ...d.data() })); setIrsaliyeler(l);
      }),
      onSnapshot(collection(db, 'onayliAnalizRaporlari'), (s) => {
        const l: any[] = []; s.forEach((d) => l.push({ id: d.id, ...d.data() })); setAnalizRaporlari(l);
      }),
      onSnapshot(collection(db, 'dijitalImzalar'), (s) => {
        const l: DijitalImza[] = []; s.forEach((d) => l.push({ id: d.id, ...(d.data() as Omit<DijitalImza, 'id'>) })); setDijitalImzalar(l);
      }),
    ];
    return () => subs.forEach((u) => u());
  }, []);

  // ── Giriş yapan kullanıcı kimliği & imza yetkisi ──
  const me = useMemo(() => {
    const email = String(currentUser?.email || '').toLowerCase();
    return kullanicilar.find((k) => String(k.email || '').toLowerCase() === email);
  }, [kullanicilar, currentUser]);

  const myEmail = String(currentUser?.email || '').toLowerCase();
  const myUnvan = normalizeYetki(me?.yetki) || 'YETKİLİ';
  const myAdSoyad = (me && `${me.ad || ''} ${me.soyad || ''}`.trim()) || currentUser?.email || 'Bilinmeyen';
  const myImzaGorsel = me?.imzaCanvas || '';
  const myImzaText = me?.imzaText || myAdSoyad;

  // ── Birleşik evrak listesi (salt okunur) ──
  const belgeler: Belge[] = useMemo(() => {
    const out: Belge[] = [];
    tutanaklar.forEach((t) =>
      out.push({ key: `TUTANAK_${t.id}`, belgeTuru: 'TUTANAK', belgeId: t.id, belgeNo: t.belgeNo || t.id, tarih: t.tarih || '', muhatap: t.muhatapPersonel || t.taseronAdi || '—', baslik: t.konu || 'Tutanak' })
    );
    faturalar.forEach((f) =>
      out.push({ key: `FATURA_${f.id}`, belgeTuru: 'FATURA', belgeId: f.id, belgeNo: f.faturaNo || f.id, tarih: f.tarih || '', muhatap: f.cariUnvan || '—', baslik: `Fatura ${f.faturaNo || ''}`.trim() })
    );
    irsaliyeler.forEach((i) =>
      out.push({ key: `İRSALİYE_${i.id}`, belgeTuru: 'İRSALİYE', belgeId: i.id, belgeNo: i.irsaliyeNo || i.id, tarih: i.tarih || '', muhatap: i.firma || '—', baslik: `İrsaliye ${i.irsaliyeNo || ''}`.trim() })
    );
    analizRaporlari.forEach((r) =>
      out.push({ key: `ANALİZ RAPORU_${r.id}`, belgeTuru: 'ANALİZ RAPORU', belgeId: r.id, belgeNo: r.faturaNo || r.id, tarih: r.tarih || '', muhatap: r.cariUnvan || '—', baslik: 'YZ Analiz Raporu' })
    );
    return out.sort((a, b) => String(b.tarih).localeCompare(String(a.tarih), 'tr'));
  }, [tutanaklar, faturalar, irsaliyeler, analizRaporlari]);

  const imzalarByBelge = useMemo(() => {
    const m = new Map<string, DijitalImza[]>();
    dijitalImzalar.forEach((x) => {
      const k = `${x.belgeTuru}_${x.belgeId}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    });
    return m;
  }, [dijitalImzalar]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR');
    return belgeler.filter((b) => {
      if (turFilter !== 'HEPSI' && b.belgeTuru !== turFilter) return false;
      const imzalar = imzalarByBelge.get(`${b.belgeTuru}_${b.belgeId}`) || [];
      const imzali = imzalar.some((x) => x.durum === 'IMZALANDI');
      if (durumFilter === 'IMZALI' && !imzali) return false;
      if (durumFilter === 'IMZASIZ' && imzali) return false;
      if (!term) return true;
      return (
        b.belgeNo.toLocaleLowerCase('tr-TR').includes(term) ||
        b.muhatap.toLocaleLowerCase('tr-TR').includes(term) ||
        b.baslik.toLocaleLowerCase('tr-TR').includes(term)
      );
    });
  }, [belgeler, search, turFilter, durumFilter, imzalarByBelge]);

  const handleImza = async (b: Belge, durum: 'IMZALANDI' | 'REDDEDILDI') => {
    if (!myEmail) {
      alert('Oturum bilgisi bulunamadı.');
      return;
    }
    const safeEmail = myEmail.replace(/[^a-z0-9]/g, '_');
    const id = `dimza_${b.belgeTuru}_${b.belgeId}_${safeEmail}`;
    setBusyKey(b.key);
    try {
      const payload: DijitalImza = {
        id,
        belgeTuru: b.belgeTuru,
        belgeId: b.belgeId,
        belgeNo: b.belgeNo,
        imzalayanEmail: myEmail,
        imzalayanAdSoyad: myAdSoyad,
        imzalayanUnvan: myUnvan,
        durum,
        imzaGorseli: myImzaGorsel || null,
        imzaText: myImzaText,
        tarih: new Date().toISOString(),
      };
      await setDoc(doc(db, 'dijitalImzalar', id), payload);
    } catch (e: any) {
      alert('Dijital imza kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'));
    } finally {
      setBusyKey(null);
    }
  };

  const toplamImzali = belgeler.filter((b) =>
    (imzalarByBelge.get(`${b.belgeTuru}_${b.belgeId}`) || []).some((x) => x.durum === 'IMZALANDI')
  ).length;

  return (
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans bg-slate-50/50 space-y-5">
      {/* Başlık */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white rounded-3xl p-5 sm:p-6 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-indigo-300" />
              <h2 className="font-display font-black text-base tracking-wide">DİJİTAL ONAY MERKEZİ</h2>
            </div>
            <p className="text-[11px] text-slate-300 max-w-xl leading-relaxed">
              Programın ürettiği evrakları kendi yetkinizle dijital olarak imzalayın veya reddedin.
              Bu ekran evrakları <strong>değiştirmez</strong>; yalnızca dijital imza/red kaydı oluşturur.
              Islak (fiili) imza sistemine karışmaz.
            </p>
          </div>

          {/* Kullanıcının dijital imza kimliği */}
          <div className="bg-white/10 border border-white/15 rounded-2xl p-3.5 min-w-[220px] backdrop-blur">
            <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-200">Dijital İmza Yetkiniz</span>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-14 h-12 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
                {myImzaGorsel ? (
                  <img src={myImzaGorsel} alt="imza" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-slate-900 text-xs font-serif italic px-1 text-center leading-tight">{myImzaText}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{myAdSoyad}</p>
                <p className="text-[10px] text-indigo-200 font-mono">{myUnvan}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Özet + filtreler */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-xs">
        <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
          <span>Toplam Evrak: <strong className="text-slate-900">{belgeler.length}</strong></span>
          <span>Dijital İmzalı: <strong className="text-emerald-600">{toplamImzali}</strong></span>
        </div>
        <div className="flex-1 min-w-[180px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Belge no, muhatap veya konu ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:border-indigo-400"
          />
        </div>
        <select value={turFilter} onChange={(e) => setTurFilter(e.target.value as any)} className="text-xs font-bold border border-slate-200 rounded-xl px-2.5 py-2 bg-slate-50 outline-none">
          <option value="HEPSI">Tüm Türler</option>
          <option value="TUTANAK">Tutanak</option>
          <option value="FATURA">Fatura</option>
          <option value="İRSALİYE">İrsaliye</option>
          <option value="ANALİZ RAPORU">YZ Analiz Raporu</option>
        </select>
        <select value={durumFilter} onChange={(e) => setDurumFilter(e.target.value as any)} className="text-xs font-bold border border-slate-200 rounded-xl px-2.5 py-2 bg-slate-50 outline-none">
          <option value="HEPSI">Tümü</option>
          <option value="IMZASIZ">İmzalanmamış</option>
          <option value="IMZALI">İmzalı</option>
        </select>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="h-40 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400">
            <FileText size={32} className="mb-2 text-slate-300" />
            <p className="text-xs font-bold">Kriterlere uygun evrak bulunamadı.</p>
          </div>
        ) : (
          filtered.map((b) => {
            const imzalar = imzalarByBelge.get(`${b.belgeTuru}_${b.belgeId}`) || [];
            const benimImzam = imzalar.find((x) => x.imzalayanEmail === myEmail);
            const busy = busyKey === b.key;
            return (
              <div key={b.key} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${TUR_RENK[b.belgeTuru]}`}>
                        {b.belgeTuru}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-800">{b.belgeNo}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{b.tarih}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{b.baslik}</p>
                    <p className="text-[11px] text-slate-500">Muhatap: <span className="font-semibold text-slate-700">{b.muhatap}</span></p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {benimImzam ? (
                      <span className={`text-[10px] font-black px-3 py-2 rounded-xl border flex items-center gap-1.5 ${
                        benimImzam.durum === 'IMZALANDI'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {benimImzam.durum === 'IMZALANDI' ? <BadgeCheck size={13} /> : <Ban size={13} />}
                        {benimImzam.durum === 'IMZALANDI' ? 'Dijital İmzaladınız' : 'Dijital Reddettiniz'}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleImza(b, 'REDDEDILDI')}
                          className="text-[10px] font-black px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <X size={13} /> Dijital Reddet
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleImza(b, 'IMZALANDI')}
                          className="text-[10px] font-black px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition flex items-center gap-1.5 cursor-pointer shadow disabled:opacity-50"
                        >
                          <PenTool size={13} /> Dijital İmzala
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Uygulanan dijital imzalar */}
                {imzalar.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    {imzalar.map((x) => (
                      <div
                        key={x.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                          x.durum === 'IMZALANDI' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                        }`}
                        title={new Date(x.tarih).toLocaleString('tr-TR')}
                      >
                        {x.durum === 'IMZALANDI' ? <Stamp size={13} className="text-emerald-600 shrink-0" /> : <Ban size={13} className="text-rose-600 shrink-0" />}
                        <div className="leading-tight">
                          <p className="text-[10px] font-bold text-slate-800">{x.imzalayanAdSoyad}</p>
                          <p className="text-[8.5px] text-slate-500 font-mono uppercase">
                            {x.imzalayanUnvan} · {x.durum === 'IMZALANDI' ? 'DİJİTAL ONAY' : 'DİJİTAL RED'} · {String(x.tarih).slice(0, 10)}
                          </p>
                        </div>
                        {x.imzaGorseli && (
                          <img src={x.imzaGorseli} alt="imza" className="h-6 w-auto max-w-[56px] object-contain rounded bg-white border border-slate-200" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DijitalOnayScreen;
