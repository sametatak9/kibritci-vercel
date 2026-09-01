import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ImageIcon, MessageCircle, Send, UserPlus, Loader2 } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { buildWhatsAppUrl } from '../lib/mobilOnayUtils';

const MAX_KIMLIK_FOTO = 2;

type GirisTalep = {
  id: string;
  ad?: string;
  soyad?: string;
  gorev?: string;
  durum?: string;
  tarih?: string;
  gonderenFormen?: string;
  kimlikFotoUrl?: string;
  kimlikFotoUrls?: string[];
};

function durumLabel(durum?: string): { text: string; className: string } {
  if (durum === 'ONAYLANDI') {
    return { text: 'Onaylandı', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
  if (durum === 'WP_GÖNDERİLDİ') {
    return { text: 'WhatsApp gönderildi', className: 'bg-sky-100 text-sky-800 border-sky-200' };
  }
  if (durum === 'GİRİŞ_BELGESİ_YÜKLENDİ') {
    return { text: 'Belge yüklendi', className: 'bg-violet-100 text-violet-800 border-violet-200' };
  }
  return { text: 'Beklemede', className: 'bg-amber-100 text-amber-800 border-amber-200' };
}

function buildWpText(talep: { id: string; ad: string; soyad: string; gorev: string }, gonderen?: string) {
  const link = `${window.location.origin}/?view_giris=${talep.id}`;
  return [
    '*KİBRİTÇİ ERP — İŞÇİ GİRİŞ TALEBİ*',
    '----------------------------------------',
    `*Ad Soyad:* ${talep.ad} ${talep.soyad}`,
    `*Görev:* ${talep.gorev}`,
    `*Tarih:* ${new Date().toLocaleDateString('tr-TR')}`,
    `*Gönderen:* ${gonderen || '—'}`,
    `*Kayıt linki:* ${link}`,
    '----------------------------------------',
    '_Sigorta / kadro girişini bu linkten tamamlayın._',
  ].join('\n');
}

interface WhatsAppIsciGirisPanelProps {
  currentUser?: { email?: string };
}

export const WhatsAppIsciGirisPanel: React.FC<WhatsAppIsciGirisPanelProps> = ({ currentUser }) => {
  const [liste, setListe] = useState<GirisTalep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yeniAd, setYeniAd] = useState('');
  const [yeniSoyad, setYeniSoyad] = useState('');
  const [yeniGorev, setYeniGorev] = useState('');
  const [fotolar, setFotolar] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sonTalep, setSonTalep] = useState<{ id: string; ad: string; soyad: string; gorev: string } | null>(null);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'personelGirisTalepleri'),
      (snap) => {
        const rows: GirisTalep[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GirisTalep, 'id'>) }));
        rows.sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
        setListe(rows);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(err);
        setError('Giriş talepleri okunamadı. Oturum veya yetki kontrol edin.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const bekleyen = useMemo(
    () => liste.filter((r) => r.durum !== 'ONAYLANDI').length,
    [liste]
  );

  const onPickFiles = (files: File[]) => {
    const slots = MAX_KIMLIK_FOTO - fotolar.length;
    files.slice(0, slots).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const raw = ev.target?.result;
        if (typeof raw !== 'string') return;
        const compressed = await compressImage(raw);
        setFotolar((prev) => (prev.length >= MAX_KIMLIK_FOTO ? prev : [...prev, compressed]));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSave = async () => {
    if (!yeniAd.trim() || !yeniSoyad.trim() || !yeniGorev.trim()) {
      setStatus({ type: 'err', text: 'Ad, soyad ve görev zorunlu.' });
      return;
    }
    if (fotolar.length === 0) {
      setStatus({ type: 'err', text: 'En az bir kimlik fotoğrafı (ön yüz) ekleyin.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const requestID = `GIRIS-${Date.now()}`;
      await setDoc(doc(db, 'personelGirisTalepleri', requestID), {
        ad: yeniAd.trim(),
        soyad: yeniSoyad.trim(),
        gorev: yeniGorev.trim(),
        kimlikFotoUrl: fotolar[0],
        kimlikFotoUrls: fotolar,
        durum: 'BEKLEMEDE',
        tarih: new Date().toISOString(),
        gonderenFormen: currentUser?.email || 'Muhasebe',
        kaynak: 'IRSALIYE_FATURA_WHATSAPP',
      });
      setSonTalep({
        id: requestID,
        ad: yeniAd.trim(),
        soyad: yeniSoyad.trim(),
        gorev: yeniGorev.trim(),
      });
      setYeniAd('');
      setYeniSoyad('');
      setYeniGorev('');
      setFotolar([]);
      setStatus({ type: 'ok', text: 'Talep kaydedildi. WhatsApp ile paylaşabilirsiniz.' });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'err', text: 'Kayıt yazılamadı. Bağlantıyı kontrol edin.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-grow p-4 sm:p-6 min-h-[calc(100vh-120px)] overflow-y-auto bg-slate-50/70">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-4">
        <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-[420px]">
          <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-[#075E54] text-white">
            <div className="flex items-center gap-2">
              <MessageCircle size={16} />
              <div>
                <h2 className="text-sm font-bold leading-tight">WhatsApp işçi girişi</h2>
                <p className="text-[10px] text-emerald-100">Kimlik foto + ad soyad → link paylaş</p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-white/15 px-2 py-1 rounded-full">
              {bekleyen} açık talep
            </span>
          </header>

          <div className="p-4 space-y-3 flex-1 bg-[#ECE5DD]">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Ad</span>
                <input
                  value={yeniAd}
                  onChange={(e) => setYeniAd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                  placeholder="Ahmet"
                />
              </label>
              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Soyad</span>
                <input
                  value={yeniSoyad}
                  onChange={(e) => setYeniSoyad(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                  placeholder="Yılmaz"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Görev / branş</span>
              <input
                value={yeniGorev}
                onChange={(e) => setYeniGorev(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                placeholder="Örn. Demirci ustası, düz işçi"
              />
            </label>

            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Kimlik fotoğrafı — ön / arka ({fotolar.length}/{MAX_KIMLIK_FOTO})
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {fotolar.length < MAX_KIMLIK_FOTO && (
                  <label className="w-24 h-20 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-500 cursor-pointer hover:border-emerald-500">
                    <Camera size={18} />
                    <span className="text-[8px] font-bold mt-1">{fotolar.length === 0 ? 'Ön yüz' : 'Arka yüz'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) as File[] : [];
                        if (files.length) onPickFiles(files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                {fotolar.map((src, idx) => (
                  <div key={idx} className="relative w-24 h-20 rounded-2xl overflow-hidden border border-slate-200">
                    <img src={src} alt={idx === 0 ? 'Ön' : 'Arka'} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFotolar((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-5 h-5 text-[10px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {fotolar.length === 0 && (
                  <div className="flex-1 min-w-[120px] h-20 rounded-2xl bg-white/70 border border-slate-200 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <ImageIcon size={16} className="mx-auto mb-1" />
                      <span className="text-[10px]">Foto yok</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {status && (
              <p className={`text-[11px] font-semibold ${status.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {status.text}
              </p>
            )}

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="w-full bg-[#25D366] hover:bg-[#1ebe5a] disabled:opacity-60 text-white font-black text-sm py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {saving ? 'Kaydediliyor…' : 'Talebi kaydet'}
            </button>

            {sonTalep && (
              <div className="rounded-2xl bg-white border border-emerald-200 p-3 space-y-2">
                <p className="text-[11px] font-bold text-emerald-800">
                  {sonTalep.ad} {sonTalep.soyad} kaydedildi. Muhasebe / idari onay için WhatsApp:
                </p>
                <pre className="text-[10px] whitespace-pre-wrap bg-slate-50 rounded-xl p-2 font-mono text-slate-700">
                  {buildWpText(sonTalep, currentUser?.email)}
                </pre>
                <a
                  href={buildWhatsAppUrl(buildWpText(sonTalep, currentUser?.email))}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async () => {
                    try {
                      await setDoc(
                        doc(db, 'personelGirisTalepleri', sonTalep.id),
                        { durum: 'WP_GÖNDERİLDİ' },
                        { merge: true }
                      );
                    } catch (e) {
                      console.warn(e);
                    }
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#075E54] text-white font-bold text-xs py-2.5 rounded-xl"
                >
                  <Send size={14} />
                  WhatsApp’tan gönder
                </a>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-[420px]">
          <header className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Giriş defteri</h3>
            <p className="text-[11px] text-slate-500">Aynı koleksiyon: personelGirisTalepleri. Mevcut onay havuzu bozulmaz.</p>
          </header>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && (
              <p className="text-center text-xs text-slate-400 py-10 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Talepler yükleniyor…
              </p>
            )}
            {error && !loading && (
              <p className="text-center text-xs text-rose-600 py-10">{error}</p>
            )}
            {!loading && !error && liste.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-10">Henüz giriş talebi yok.</p>
            )}
            {liste.map((item) => {
              const badge = durumLabel(item.durum);
              const wp = buildWpText(
                {
                  id: item.id,
                  ad: item.ad || '—',
                  soyad: item.soyad || '',
                  gorev: item.gorev || '—',
                },
                item.gonderenFormen
              );
              return (
                <article key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {item.ad} {item.soyad}
                      </h4>
                      <p className="text-[11px] text-slate-500">{item.gorev || 'Görev yok'}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${badge.className}`}>
                      {badge.text}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {item.tarih ? new Date(item.tarih).toLocaleString('tr-TR') : '—'} · {item.gonderenFormen?.split('@')[0] || '—'}
                  </p>
                  <a
                    href={buildWhatsAppUrl(wp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#075E54] hover:underline"
                  >
                    <MessageCircle size={12} /> Tekrar WhatsApp
                  </a>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
