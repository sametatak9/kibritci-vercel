import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, Search } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PARSEL_BLOK_MAP, PARSEL_LIST, defaultBlokForParsel } from '../data/parselBlokMap';
import { buildParselBlokAnaliz, ParselBlokAnalizOzet } from '../lib/parselBlokAnalizUtils';
import { downloadCsv } from '../lib/reportExport';
import { kibritciLogoHtml, kibritciReportHeaderHtml } from '../lib/kibritciBrand';
import { SahaFaaliyeti, SahaKolajFoto } from '../types/erp';
import { todayDateKey } from '../lib/dateKeyUtils';

interface ParselBlokAnalizPanelProps {
  sahaFaaliyetleri: SahaFaaliyeti[];
}

export const ParselBlokAnalizPanel: React.FC<ParselBlokAnalizPanelProps> = ({ sahaFaaliyetleri }) => {
  const [analizParsel, setAnalizParsel] = useState('TUMU');
  const [analizBlok, setAnalizBlok] = useState('TUMU');
  const [baslangicTarih, setBaslangicTarih] = useState('');
  const [bitisTarih, setBitisTarih] = useState(todayDateKey());
  const [kolajFotolari, setKolajFotolari] = useState<SahaKolajFoto[]>([]);
  const [analizSonuc, setAnalizSonuc] = useState<ParselBlokAnalizOzet | null>(null);
  const [analizCalistirildi, setAnalizCalistirildi] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sahaKolajFotolari'), (snap) => {
      const list: SahaKolajFoto[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SahaKolajFoto));
      setKolajFotolari(list);
    });
    return () => unsub();
  }, []);

  const blokSecenekleri = useMemo(() => {
    if (analizParsel === 'TUMU') return ['TUMU'];
    return ['TUMU', ...(PARSEL_BLOK_MAP[analizParsel] || [])];
  }, [analizParsel]);

  const handleAnalizEt = () => {
    const sonuc = buildParselBlokAnaliz({
      sahaFaaliyetleri,
      kolajFotolari,
      parsel: analizParsel === 'TUMU' ? undefined : analizParsel,
      blok: analizBlok === 'TUMU' ? undefined : analizBlok,
      baslangicTarih: baslangicTarih || undefined,
      bitisTarih: bitisTarih || undefined,
    });
    setAnalizSonuc(sonuc);
    setAnalizCalistirildi(true);
  };

  const exportExcel = () => {
    if (!analizSonuc) return;
    const header = [
      'Tarih',
      'Kaynak',
      'Parsel',
      'Blok',
      'İş Niteliği',
      'Usta',
      'İşçi',
      'Personel Atama',
      'Foto',
      'Açıklama',
    ];
    const rows = analizSonuc.rows.map((r) => [
      r.tarih,
      r.kaynak,
      r.parsel,
      r.blok,
      r.isNiteligi,
      String(r.ustaSayisi),
      String(r.isciSayisi),
      String(r.personelAdet),
      r.fotoVar ? 'Evet' : 'Hayır',
      r.aciklama,
    ]);
    downloadCsv([header, ...rows], `parsel-blok-analiz_${bitisTarih || todayDateKey()}.csv`);
  };

  const exportPdf = () => {
    if (!analizSonuc) return;
    const tableRows = analizSonuc.rows
      .map(
        (r, idx) =>
          `<tr><td>${idx + 1}</td><td>${r.tarih}</td><td>${r.kaynak}</td><td>${r.parsel}</td><td>${r.blok}</td><td>${r.isNiteligi}</td><td>${r.ustaSayisi}</td><td>${r.isciSayisi}</td><td>${r.personelAdet}</td></tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Parsel Blok Analiz</title>
      <style>
        body{font-family:Segoe UI,Arial,sans-serif;padding:28px;color:#0f172a;background:#fff;}
        .ozet{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0;}
        .kart{border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#f8fafc;font-size:11px;}
        .kart b{display:block;font-size:18px;color:#1e4e78;margin-top:4px;}
        table{width:100%;border-collapse:collapse;font-size:10px;margin-top:12px;}
        th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;}
        th{background:#1e4e78;color:#fff;}
        tr:nth-child(even){background:#f8fafc;}
      </style></head><body>
      ${kibritciReportHeaderHtml('Parsel Blok Analiz Raporu', `${analizParsel === 'TUMU' ? 'Tüm Parseller' : analizParsel} · ${analizBlok === 'TUMU' ? 'Tüm Bloklar' : analizBlok}`)}
      <div class="ozet">
        <div class="kart">Toplam Faaliyet<b>${analizSonuc.toplamFaaliyet}</b></div>
        <div class="kart">Formen Mobil<b>${analizSonuc.formenKayit}</b></div>
        <div class="kart">İdari Saha<b>${analizSonuc.idariKayit}</b></div>
        <div class="kart">Saha Kolaj<b>${analizSonuc.kolajFoto}</b></div>
      </div>
      <table><thead><tr><th>#</th><th>Tarih</th><th>Kaynak</th><th>Parsel</th><th>Blok</th><th>İş Niteliği</th><th>Usta</th><th>İşçi</th><th>Personel</th></tr></thead>
      <tbody>${tableRows || '<tr><td colspan="9">Kayıt yok</td></tr>'}</tbody></table>
      <p style="font-size:9px;color:#94a3b8;margin-top:20px;text-align:center;">Kibritçi ERP · ${new Date().toLocaleString('tr-TR')}</p>
      <script>window.onload=()=>window.print()</script></body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      alert('Yazdırma penceresi açılamadı.');
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-slate-50/20">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-slate-800" />
          <h5 className="font-bold text-sm text-slate-800">Parsel Blok Analiz</h5>
        </div>
        <p className="text-[10px] text-slate-500">
          Saha Faaliyetleri, Formen Mobil ve Saha Kolaj kaynaklarından parsel/blok bazlı analiz üretir.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase">Parsel</label>
            <select
              value={analizParsel}
              onChange={(e) => {
                setAnalizParsel(e.target.value);
                setAnalizBlok('TUMU');
              }}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5"
            >
              <option value="TUMU">Tüm Parseller</option>
              {PARSEL_LIST.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase">Blok</label>
            <select
              value={analizBlok}
              onChange={(e) => setAnalizBlok(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5"
            >
              {blokSecenekleri.map((b) => (
                <option key={b} value={b}>{b === 'TUMU' ? 'Tüm Bloklar' : b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase">Başlangıç</label>
            <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase">Bitiş</label>
            <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleAnalizEt} className="text-[10px] bg-slate-900 hover:bg-slate-900 text-white font-bold px-3 py-2 rounded-lg flex items-center gap-1 cursor-pointer">
            <Search size={12} /> Analiz Et
          </button>
          {analizSonuc && (
            <>
              <button type="button" onClick={exportExcel} className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg flex items-center gap-1 cursor-pointer">
                <FileSpreadsheet size={12} /> Excel
              </button>
              <button type="button" onClick={exportPdf} className="text-[10px] bg-slate-700 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-lg flex items-center gap-1 cursor-pointer">
                <Download size={12} /> PDF / Yazdır
              </button>
            </>
          )}
        </div>
      </div>

      {analizCalistirildi && analizSonuc && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['Toplam Faaliyet', analizSonuc.toplamFaaliyet],
              ['Formen Mobil', analizSonuc.formenKayit],
              ['İdari Saha', analizSonuc.idariKayit],
              ['Saha Kolaj', analizSonuc.kolajFoto],
            ].map(([label, val]) => (
              <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <div className="text-[9px] text-slate-500 font-bold uppercase">{label}</div>
                <div className="text-xl font-black text-slate-800">{val}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Tarih</th>
                  <th className="p-2 text-left">Kaynak</th>
                  <th className="p-2 text-left">Parsel / Blok</th>
                  <th className="p-2 text-left">İş Niteliği</th>
                  <th className="p-2 text-right">Usta</th>
                  <th className="p-2 text-right">İşçi</th>
                </tr>
              </thead>
              <tbody>
                {analizSonuc.rows.length === 0 ? (
                  <tr><td colSpan={6} className="p-4 text-center text-slate-400 italic">Seçilen kriterlerde kayıt bulunamadı.</td></tr>
                ) : (
                  analizSonuc.rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="p-2 font-mono">{r.tarih}</td>
                      <td className="p-2">{r.kaynak}</td>
                      <td className="p-2">{r.parsel} / {r.blok}</td>
                      <td className="p-2">{r.isNiteligi}</td>
                      <td className="p-2 text-right">{r.ustaSayisi}</td>
                      <td className="p-2 text-right">{r.isciSayisi}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default ParselBlokAnalizPanel;
