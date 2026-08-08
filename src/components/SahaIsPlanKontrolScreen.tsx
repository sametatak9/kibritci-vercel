import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck2, Camera, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  FileText, HardHat, Image as ImageIcon, MapPin, Plus, Trash2, Users, XCircle,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { AylikYoklamaMap, Personel, SahaIsPlanDurum, SahaIsPlani } from '../types/erp';
import { db, removeDocument, saveDocument } from '../lib/firebase';
import { assertErpWriteAuth } from '../lib/authWriteGuard';
import { buildGeldiHavuzu } from '../lib/geldiHavuzuUtils';
import { formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';
import { PARSEL_LIST, blokListForParsel, defaultBlokForParsel } from '../data/parselBlokMap';
import { uploadSahaIsPlanKaniti } from '../lib/sahaIsPlanFotoStorage';

interface Props {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  currentUser?: { email?: string; uid?: string } | null;
}

const BIRIMLER = ['m²', 'm³', 'metre', 'adet', 'ton', 'kamyon', 'saat', 'diğer'];
const STATUS: Record<SahaIsPlanDurum, { label: string; cls: string }> = {
  PLANLANDI: { label: 'Planlandı', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  BASLADI: { label: 'Başladı', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  KONTROLDE: { label: 'Kontrolde', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  TAMAMLANDI: { label: 'Tamamlandı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  EKSIK_KALDI: { label: 'Eksik kaldı', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

function dateShift(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const SahaIsPlanKontrolScreen: React.FC<Props> = ({ personeller, yoklamalar, currentUser }) => {
  const [selectedDate, setSelectedDate] = useState(todayDateKey());
  const [plans, setPlans] = useState<SahaIsPlani[]>([]);
  const [isTanimi, setIsTanimi] = useState('');
  const [parsel, setParsel] = useState(PARSEL_LIST[0] || 'GENEL SAHA');
  const [blok, setBlok] = useState(defaultBlokForParsel(PARSEL_LIST[0] || 'GENEL SAHA'));
  const [birim, setBirim] = useState('m²');
  const [planlananMiktar, setPlanlananMiktar] = useState('');
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const startInput = useRef<HTMLInputElement>(null);
  const finishInput = useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = useState<{ id: string; stage: 'baslangic' | 'bitis' } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sahaIsPlanlari'), (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SahaIsPlani)));
    });
    return () => unsub();
  }, []);

  const dayPlans = useMemo(
    () => plans.filter((p) => p.tarih === selectedDate).sort((a, b) => a.olusturmaTarihi.localeCompare(b.olusturmaTarihi)),
    [plans, selectedDate]
  );
  const geldi = useMemo(() => buildGeldiHavuzu(personeller, yoklamalar, selectedDate)
    .filter((p) => String(p.gorev || '').toLocaleUpperCase('tr-TR').includes('DÜZ İŞÇİ')),
    [personeller, yoklamalar, selectedDate]);
  const assignedIds = useMemo(() => new Set(dayPlans.flatMap((p) => p.personelIds)), [dayPlans]);
  const unassigned = geldi.filter((p) => !assignedIds.has(p.id));
  const completed = dayPlans.filter((p) => p.durum === 'TAMAMLANDI').length;
  const proofMissing = dayPlans.filter((p) => !p.baslangicKaniti || !p.bitisKaniti).length;
  const blocks = useMemo(() => blokListForParsel(parsel), [parsel]);

  const personLabel = (id: string) => {
    const p = personeller.find((x) => x.id === id);
    return p ? `${p.ad} ${p.soyad}` : id;
  };
  const pct = (p: SahaIsPlani) => p.planlananMiktar > 0
    ? Math.min(100, Math.round((p.gerceklesenMiktar / p.planlananMiktar) * 100)) : 0;

  const persist = async (plan: SahaIsPlani) => {
    const blocked = await assertErpWriteAuth();
    if (blocked) throw new Error(blocked);
    await saveDocument('sahaIsPlanlari', plan);
  };

  const createPlan = async () => {
    const target = Number(planlananMiktar.replace(',', '.'));
    if (!isTanimi.trim() || !Number.isFinite(target) || target <= 0 || selectedPeople.length === 0) {
      alert('İş tanımı, planlanan miktar ve en az bir gelen düz işçi zorunludur.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await persist({
        id: `sip_${Date.now()}`,
        tarih: selectedDate,
        parsel,
        blok,
        isTanimi: isTanimi.trim(),
        birim,
        planlananMiktar: target,
        gerceklesenMiktar: 0,
        personelIds: selectedPeople,
        durum: 'PLANLANDI',
        olusturan: currentUser?.email || 'Saha İş Planı',
        olusturmaTarihi: now,
        guncellemeTarihi: now,
      });
      setIsTanimi(''); setPlanlananMiktar(''); setSelectedPeople([]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'İş planı kaydedilemedi.');
    } finally { setSaving(false); }
  };

  const update = async (plan: SahaIsPlani, change: Partial<SahaIsPlani>) => {
    setBusyId(plan.id);
    try { await persist({ ...plan, ...change, guncellemeTarihi: new Date().toISOString() }); }
    catch (e) { alert(e instanceof Error ? e.message : 'Kayıt güncellenemedi.'); }
    finally { setBusyId(null); }
  };

  const pickProof = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !photoTarget) return;
    const plan = plans.find((p) => p.id === photoTarget.id);
    if (!plan) return;
    setBusyId(plan.id);
    try {
      const raw = await readFile(file);
      const url = await uploadSahaIsPlanKaniti(plan.id, photoTarget.stage, raw);
      const kanit = { url, tarih: new Date().toISOString() };
      await persist({
        ...plan,
        ...(photoTarget.stage === 'baslangic'
          ? { baslangicKaniti: kanit, durum: plan.durum === 'PLANLANDI' ? 'BASLADI' as const : plan.durum,
              baslangicSaati: plan.baslangicSaati || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }
          : { bitisKaniti: kanit }),
        guncellemeTarihi: new Date().toISOString(),
      });
    } catch (e) { alert(e instanceof Error ? e.message : 'Fotoğraf yüklenemedi.'); }
    finally { setPhotoTarget(null); setBusyId(null); }
  };

  const deletePlan = async (plan: SahaIsPlani) => {
    if (!confirm(`“${plan.isTanimi}” iş planı silinsin mi?`)) return;
    setBusyId(plan.id);
    try { await removeDocument('sahaIsPlanlari', plan.id); }
    catch { alert('İş planı silinemedi.'); }
    finally { setBusyId(null); }
  };

  const printReport = () => {
    const rows = dayPlans.map((p) => `<tr><td>${p.parsel} · ${p.blok}</td><td>${p.isTanimi}</td><td>${p.personelIds.map(personLabel).join(', ')}</td><td>${p.gerceklesenMiktar} / ${p.planlananMiktar} ${p.birim} (%${pct(p)})</td><td>${STATUS[p.durum].label}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Saha İş Planı — ${selectedDate}</title><style>body{font:12px Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}h1{margin-bottom:4px}</style></head><body><h1>Saha İş Planı ve Kontrol</h1><p>${formatDateLabelTr(selectedDate)} · Gelen düz işçi: ${geldi.length} · Görevsiz: ${unassigned.length}</p><table><thead><tr><th>Konum</th><th>İş</th><th>Ekip</th><th>Gerçekleşme</th><th>Durum</th></tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`);
    w.document.close();
  };

  return <div className="max-w-[1500px] mx-auto space-y-4">
    <input ref={startInput} type="file" accept="image/*" className="hidden" onChange={pickProof} />
    <input ref={finishInput} type="file" accept="image/*" className="hidden" onChange={pickProof} />
    <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white p-5 sm:p-6 shadow-lg">
      <div className="flex flex-wrap justify-between gap-4">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">Düz İşçi · Plan · Kanıt · Verim</p><h1 className="text-2xl font-black mt-1">Saha İş Planı ve Kontrol</h1><p className="text-xs text-slate-300 mt-2 max-w-2xl">Gelen düz işçiyi parsel ve blok bazında planlayın; miktarı, ilk/son hâl kanıtını ve gün sonu sonucunu tek kayıtta yönetin.</p></div>
        <div className="flex flex-wrap items-center gap-2 self-start bg-white/10 p-2 rounded-2xl border border-white/15 w-full sm:w-auto"><button onClick={() => setSelectedDate(dateShift(selectedDate, -1))} className="p-2 hover:bg-white/10 rounded-lg shrink-0"><ChevronLeft size={17}/></button><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="min-w-0 flex-1 sm:flex-none bg-slate-900 border border-white/20 rounded-lg px-2 py-1.5 text-xs font-bold"/><button onClick={() => setSelectedDate(dateShift(selectedDate, 1))} className="p-2 hover:bg-white/10 rounded-lg shrink-0"><ChevronRight size={17}/></button><button onClick={printReport} className="flex-1 sm:flex-none justify-center px-3 py-2 bg-emerald-400 text-slate-950 rounded-lg text-[10px] font-black uppercase inline-flex gap-1"><FileText size={13}/> Rapor</button></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-5">{[
        ['Gelen düz işçi', geldi.length, Users], ['Planlı personel', assignedIds.size, HardHat], ['Görevsiz', unassigned.length, XCircle], ['Tamamlanan iş', `${completed}/${dayPlans.length}`, CheckCircle2], ['Kanıt eksiği', proofMissing, Camera],
      ].map(([label, value, Icon]: any) => <div key={label} className="bg-white/10 border border-white/15 rounded-xl p-3"><Icon size={14} className="text-emerald-200"/><p className="text-lg font-black mt-1">{value}</p><p className="text-[9px] uppercase font-bold text-slate-300">{label}</p></div>)}</div>
    </section>

    <section className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h2 className="font-black text-slate-800 flex gap-2 items-center"><Plus size={18} className="text-emerald-600"/> Yeni iş planı</h2>
        <input value={isTanimi} onChange={(e) => setIsTanimi(e.target.value)} placeholder="Yapılacak iş (örn. çevre temizliği)" className="w-full border rounded-xl p-2.5 text-sm" />
        <div className="grid grid-cols-2 gap-2"><select value={parsel} onChange={(e) => { setParsel(e.target.value); setBlok(defaultBlokForParsel(e.target.value)); }} className="border rounded-xl p-2.5 text-xs font-bold">{PARSEL_LIST.map(x => <option key={x}>{x}</option>)}</select><select value={blok} onChange={(e) => setBlok(e.target.value)} className="border rounded-xl p-2.5 text-xs font-bold">{(blocks.length ? blocks : ['GENEL SAHA']).map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-2"><input inputMode="decimal" value={planlananMiktar} onChange={(e) => setPlanlananMiktar(e.target.value)} placeholder="Planlanan miktar" className="border rounded-xl p-2.5 text-sm"/><select value={birim} onChange={(e) => setBirim(e.target.value)} className="border rounded-xl p-2.5 text-xs font-bold">{BIRIMLER.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="border rounded-xl p-3 bg-slate-50"><p className="text-[10px] font-black uppercase text-slate-500 mb-2">Gelen, henüz atanmadı ({unassigned.length})</p><div className="max-h-48 overflow-y-auto space-y-1">{unassigned.length ? unassigned.map(p => <label key={p.id} className="flex gap-2 items-center text-xs font-semibold p-1.5 hover:bg-white rounded cursor-pointer"><input type="checkbox" checked={selectedPeople.includes(p.id)} onChange={() => setSelectedPeople(v => v.includes(p.id) ? v.filter(x => x !== p.id) : [...v, p.id])}/>{p.ad} {p.soyad}</label>) : <p className="text-xs text-slate-400">Görevsiz gelen düz işçi yok.</p>}</div></div>
        <button disabled={saving} onClick={() => void createPlan()} className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black disabled:opacity-50">{saving ? 'Kaydediliyor…' : 'İş Planını Oluştur'}</button>
      </div>

      <div className="space-y-3"><div className="flex items-center justify-between px-1"><h2 className="font-black text-slate-800 flex items-center gap-2"><ClipboardList size={18} className="text-emerald-600"/> Günün iş emirleri</h2><span className="text-xs font-bold text-slate-400">{formatDateLabelTr(selectedDate)}</span></div>
        {dayPlans.length === 0 ? <div className="bg-white rounded-2xl border border-dashed p-10 text-center text-slate-400 text-sm">Bu gün için henüz iş planı yok.</div> : dayPlans.map(plan => <article key={plan.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase text-slate-400 flex gap-1 items-center"><MapPin size={11}/>{plan.parsel} · {plan.blok}</p><h3 className="font-black text-slate-900 mt-1 break-words">{plan.isTanimi}</h3><p className="text-xs text-slate-500 mt-1 break-words">{plan.personelIds.map(personLabel).join(', ')}</p></div><div className="flex sm:block items-center gap-2 w-full sm:w-auto sm:text-right"><select disabled={busyId === plan.id} value={plan.durum} onChange={(e) => void update(plan, { durum: e.target.value as SahaIsPlanDurum })} className={`flex-1 sm:flex-none text-[10px] font-black border rounded-lg px-2 py-1 ${STATUS[plan.durum].cls}`}>{Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select><button disabled={busyId === plan.id} onClick={() => void deletePlan(plan)} className="sm:block sm:ml-auto sm:mt-2 text-rose-500"><Trash2 size={15}/></button></div></div>
          <div><div className="flex justify-between text-xs font-bold"><span>Gerçekleşme</span><span>{plan.gerceklesenMiktar} / {plan.planlananMiktar} {plan.birim} · %{pct(plan)}</span></div><div className="h-2 mt-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{width: `${pct(plan)}%`}}/></div><input inputMode="decimal" defaultValue={plan.gerceklesenMiktar || ''} onBlur={(e) => { const value = Number(e.target.value.replace(',', '.')); if (Number.isFinite(value) && value !== plan.gerceklesenMiktar) void update(plan, { gerceklesenMiktar: value }); }} placeholder="Gerçekleşen miktarı girin" className="mt-2 border rounded-lg p-2 text-xs w-full"/></div>
          <div className="grid sm:grid-cols-2 gap-2"><button disabled={busyId === plan.id} onClick={() => { setPhotoTarget({id: plan.id, stage:'baslangic'}); startInput.current?.click(); }} className={`border rounded-xl p-2 text-left text-xs font-bold flex items-center gap-2 ${plan.baslangicKaniti ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><ImageIcon size={15}/>{plan.baslangicKaniti ? 'İlk hâl kanıtı var' : 'İlk hâl fotoğrafı ekle'}</button><button disabled={busyId === plan.id} onClick={() => { setPhotoTarget({id: plan.id, stage:'bitis'}); finishInput.current?.click(); }} className={`border rounded-xl p-2 text-left text-xs font-bold flex items-center gap-2 ${plan.bitisKaniti ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><Camera size={15}/>{plan.bitisKaniti ? 'Son hâl kanıtı var' : 'Son hâl fotoğrafı ekle'}</button></div>
          {(plan.baslangicKaniti || plan.bitisKaniti) && <div className="flex gap-2">{plan.baslangicKaniti && <a href={plan.baslangicKaniti.url} target="_blank" rel="noreferrer" className="text-[10px] text-sky-700 underline">İlk hâl fotoğrafını aç</a>}{plan.bitisKaniti && <a href={plan.bitisKaniti.url} target="_blank" rel="noreferrer" className="text-[10px] text-sky-700 underline">Son hâl fotoğrafını aç</a>}</div>}
          <textarea defaultValue={plan.gunSonuNotu || ''} onBlur={(e) => { const value=e.target.value.trim(); if(value !== (plan.gunSonuNotu || '')) void update(plan, { gunSonuNotu: value }); }} placeholder="Gün sonu sonucu / eksik kalma nedeni…" rows={2} className="w-full border rounded-xl p-2 text-xs resize-none" />
        </article>)}</div>
    </section>
  </div>;
};

export default SahaIsPlanKontrolScreen;
