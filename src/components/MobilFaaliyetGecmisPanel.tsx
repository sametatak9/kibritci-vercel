import React, { useMemo, useState } from 'react';
import { History, Pencil, Trash2, Search, RefreshCw, Check, X, Camera } from 'lucide-react';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isMobilDocPending } from '../lib/mobilOnayUtils';
import { openBase64InNewTab } from '../lib/fileViewerUtils';

export type MobilFaaliyetGecmisKind = 'kamp' | 'tesisatci' | 'mermerci' | 'seramik';

interface MobilFaaliyetGecmisPanelProps {
  title: string;
  kind: MobilFaaliyetGecmisKind;
  collectionName: string;
  items: Array<Record<string, any>>;
}

function durumBadge(durum?: string) {
  if (durum === 'ONAYLANDI') {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
        ONAYLANDI
      </span>
    );
  }
  if (durum === 'REDDEDİLDİ' || durum === 'REDDEDILDI') {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
        REDDEDİLDİ
      </span>
    );
  }
  return (
    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
      {durum || 'KAYITLI'}
    </span>
  );
}

function fotoOf(item: Record<string, any>): string {
  return (
    item.fotoUrl ||
    (Array.isArray(item.fotoUrls) ? item.fotoUrls[0] : '') ||
    item.photo ||
    ''
  );
}

export const MobilFaaliyetGecmisPanel: React.FC<MobilFaaliyetGecmisPanelProps> = ({
  title,
  kind,
  collectionName,
  items,
}) => {
  const [arama, setArama] = useState('');
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [tarih, setTarih] = useState('');
  const [isNiteligi, setIsNiteligi] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [calismaAlani, setCalismaAlani] = useState('');
  const [yerleskeAdi, setYerleskeAdi] = useState('');
  const [parsel, setParsel] = useState('');
  const [blok, setBlok] = useState('');
  const [kategori, setKategori] = useState('');
  const [saving, setSaving] = useState(false);

  const gecmis = useMemo(() => {
    const list = (items || []).filter((d) => !isMobilDocPending(d));
    list.sort(
      (a, b) =>
        String(b.tarih || '').localeCompare(String(a.tarih || '')) ||
        String(b.olusturulma || b.onayTarihi || '').localeCompare(
          String(a.olusturulma || a.onayTarihi || '')
        )
    );
    return list;
  }, [items]);

  const filtered = useMemo(() => {
    const q = arama.trim().toLowerCase();
    if (!q) return gecmis;
    return gecmis.filter((d) => {
      const haystack = [
        d.tarih,
        d.isNiteligi,
        d.aciklama,
        d.kaydeden,
        d.kaydedenKampci,
        d.calismaAlani,
        d.yerleskeAdi,
        d.parsel,
        d.blok,
        d.kategori,
        d.durum,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  }, [gecmis, arama]);

  const openEdit = (d: Record<string, any>) => {
    setEditing(d);
    setTarih(String(d.tarih || '').slice(0, 10));
    setIsNiteligi(d.isNiteligi || '');
    setAciklama(d.aciklama || d.faaliyetAciklama || '');
    setCalismaAlani(d.calismaAlani || '');
    setYerleskeAdi(d.yerleskeAdi || d.faaliyetYerleske || '');
    setParsel(d.parsel || '');
    setBlok(d.blok || '');
    setKategori(d.kategori || d.faaliyetTipi || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!tarih) {
      alert('Tarih zorunlu.');
      return;
    }
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        tarih,
        aciklama: aciklama.trim(),
        guncellenme: new Date().toISOString(),
      };
      if (kind === 'kamp') {
        patch.kategori = kategori.trim() || editing.kategori;
        patch.yerleskeAdi = yerleskeAdi.trim();
      } else if (kind === 'tesisatci') {
        patch.isNiteligi = isNiteligi.trim() || editing.isNiteligi;
        patch.calismaAlani = calismaAlani.trim() || editing.calismaAlani;
        patch.yerleskeAdi = yerleskeAdi.trim();
      } else {
        patch.isNiteligi = isNiteligi.trim() || editing.isNiteligi;
        patch.parsel = parsel.trim();
        patch.blok = blok.trim();
      }
      await updateDoc(doc(db, collectionName, editing.id), patch);
      setEditing(null);
    } catch (err: any) {
      alert('Kayıt güncellenemedi: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleSil = async (d: Record<string, any>) => {
    const onayli = d.durum === 'ONAYLANDI';
    if (
      !window.confirm(
        `${d.tarih || ''} kaydı silinsin mi?${
          onayli ? '\n\nBu kayıt onaylanmış. Silmek faaliyet geçmişinden kaldırır.' : ''
        }`
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, collectionName, d.id));
      if (editing?.id === d.id) setEditing(null);
    } catch (err: any) {
      alert('Silinemedi: ' + (err?.message || ''));
    }
  };

  return (
    <div className="border bg-white p-4.5 rounded-2xl border-slate-200 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <span className="text-slate-700 font-bold block text-[11px] tracking-widest uppercase flex items-center gap-1.5">
            <History size={13} /> {title}
          </span>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            Onaylanmış ve reddedilmiş girişler. Düzeltip kaydedebilir veya gerekirse silebilirsiniz.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-black bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
          {gecmis.length} geçmiş
        </span>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Tarih, iş, açıklama, kaydeden…"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-[11px] font-semibold"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic py-4 text-center">
          {gecmis.length === 0 ? 'Henüz geçmiş kayıt yok.' : 'Aramaya uyan kayıt yok.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {filtered.map((d) => {
              const foto = fotoOf(d);
              return (
                <div
                  key={d.id}
                  className={`bg-slate-50 border rounded-xl p-3 flex gap-3 ${
                    editing?.id === d.id ? 'border-sky-400 ring-1 ring-sky-200' : 'border-slate-200'
                  }`}
                >
                  {foto ? (
                    <button
                      type="button"
                      onClick={() => openBase64InNewTab(foto, `faaliyet_${d.id}.jpg`)}
                      className="shrink-0 cursor-pointer"
                    >
                      <img src={foto} alt="" className="w-14 h-14 rounded-lg object-cover border" />
                    </button>
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-slate-100 border flex items-center justify-center shrink-0">
                      <Camera size={14} className="text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-900 truncate flex items-center gap-1.5 flex-wrap">
                      {d.isNiteligi || d.kategori || d.faaliyetTipi || 'Faaliyet'} {durumBadge(d.durum)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {d.tarih || '—'}
                      {d.calismaAlani ? ` · ${d.calismaAlani}` : ''}
                      {d.yerleskeAdi ? ` · ${d.yerleskeAdi}` : ''}
                      {d.parsel ? ` · ${d.parsel}` : ''}
                      {d.blok ? ` / ${d.blok}` : ''}
                    </p>
                    {d.aciklama ? (
                      <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">{d.aciklama}</p>
                    ) : null}
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      Kaydeden: {d.kaydeden || d.kaydedenKampci || '—'}
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => openEdit(d)}
                        className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-sky-600 text-white cursor-pointer"
                      >
                        <Pencil size={11} /> Düzelt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSil(d)}
                        className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                      >
                        <Trash2 size={11} /> Sil
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            {!editing ? (
              <div className="h-full min-h-[180px] flex items-center justify-center text-slate-400 text-xs italic">
                Soldan bir geçmiş kaydı seçip düzeltin.
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-3 text-xs">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700 border-b pb-2">
                  Geçmiş kaydı düzelt
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Tarih</label>
                    <input
                      type="date"
                      required
                      value={tarih}
                      onChange={(e) => setTarih(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                  {kind === 'kamp' ? (
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase">Kategori</label>
                      <input
                        value={kategori}
                        onChange={(e) => setKategori(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase">İş niteliği</label>
                      <input
                        value={isNiteligi}
                        onChange={(e) => setIsNiteligi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      />
                    </div>
                  )}
                  {kind === 'tesisatci' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Çalışma alanı</label>
                        <input
                          value={calismaAlani}
                          onChange={(e) => setCalismaAlani(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Yerleşke</label>
                        <input
                          value={yerleskeAdi}
                          onChange={(e) => setYerleskeAdi(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                        />
                      </div>
                    </>
                  )}
                  {kind === 'kamp' && (
                    <div className="space-y-1 col-span-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase">Yerleşke</label>
                      <input
                        value={yerleskeAdi}
                        onChange={(e) => setYerleskeAdi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      />
                    </div>
                  )}
                  {(kind === 'mermerci' || kind === 'seramik') && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Parsel</label>
                        <input
                          value={parsel}
                          onChange={(e) => setParsel(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Blok</label>
                        <input
                          value={blok}
                          onChange={(e) => setBlok(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                        />
                      </div>
                    </>
                  )}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Açıklama</label>
                    <textarea
                      value={aciklama}
                      onChange={(e) => setAciklama(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold resize-y"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-3 rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    KAYDET
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-[10px] cursor-pointer"
                  >
                    <X size={12} className="inline mr-1" />
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

export default MobilFaaliyetGecmisPanel;
