import React, { useMemo, useState } from 'react';
import { FileText, Upload, Send, Plus, Trash2, Printer } from 'lucide-react';
import {
  CariKart,
  CariKartIslem,
  HazirTutanak,
  MalzemeTeslimKalem,
  Personel,
  StokKart,
} from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import { firmaEslesir, getTaseronCariKartlar } from '../lib/taseronUtils';
import { todayDateKey } from '../lib/dateKeyUtils';
import { installReportEmailGlobalBridge, openReportEmailComposer } from '../lib/reportEmail';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v).trim();
  return s || '&nbsp;';
};

interface HazirTutanakTabProps {
  hazirTutanaklar: HazirTutanak[];
  setHazirTutanaklar: React.Dispatch<React.SetStateAction<HazirTutanak[]>>;
  personeller: Personel[];
  cariKartlar?: CariKart[];
  stokKartlar?: StokKart[];
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
}

const emptyKalem = (): MalzemeTeslimKalem => ({
  id: `mk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  malzemeAdi: '',
  miktar: '',
  cinsi: 'Adet',
  aciklama: '',
});

export const HazirTutanakTab: React.FC<HazirTutanakTabProps> = ({
  hazirTutanaklar,
  setHazirTutanaklar,
  personeller,
  cariKartlar = [],
  stokKartlar = [],
  setCariIslemGecmisi,
}) => {
  const [tutanakType, setTutanakType] = useState<HazirTutanak['tutanakTipi']>('TESLİM');
  const [tutanakSubject, setTutanakSubject] = useState('Malzeme Teslim Tutanağı');
  const [tutanakPerson, setTutanakPerson] = useState('');
  const [muhatapManuel, setMuhatapManuel] = useState('');
  const [tutanakText, setTutanakText] = useState('');
  const [tutanakTarih, setTutanakTarih] = useState(todayDateKey());
  const [taseronKaynak, setTaseronKaynak] = useState('');
  const [taseronManuel, setTaseronManuel] = useState('');
  const [cezaTutari, setCezaTutari] = useState(0);
  const [kalemler, setKalemler] = useState<MalzemeTeslimKalem[]>([emptyKalem()]);
  const [teslimEden, setTeslimEden] = useState('');
  const [teslimAlan, setTeslimAlan] = useState('');

  const [tutanakSearch, setTutanakSearch] = useState('');
  const [editingTutanakId, setEditingTutanakId] = useState<string | null>(null);
  const [deleteConfirmTutanakId, setDeleteConfirmTutanakId] = useState<string | null>(null);

  const taseronCariler = useMemo(() => getTaseronCariKartlar(cariKartlar), [cariKartlar]);
  /** TESLİM için taşeron + diğer aktif cariler (Demirkaan vb. tip farkı engellemesin) */
  const firmaSecenekleri = useMemo(() => {
    const seen = new Set<string>();
    const out: CariKart[] = [];
    for (const c of [...taseronCariler, ...(cariKartlar || [])]) {
      if (!c?.id || c.durum === 'PASIF' || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out.sort((a, b) => (a.unvan || '').localeCompare(b.unvan || '', 'tr'));
  }, [cariKartlar, taseronCariler]);
  const aktifStoklar = useMemo(
    () => (stokKartlar || []).filter((s) => s.durum !== 'PASIF'),
    [stokKartlar]
  );

  const resolveTaseron = (): { cariKartId?: string; taseronAdi: string } => {
    if (taseronKaynak && taseronKaynak !== 'MANUEL') {
      const c =
        taseronCariler.find((x) => x.id === taseronKaynak) ||
        cariKartlar.find((x) => x.id === taseronKaynak);
      return { cariKartId: c?.id, taseronAdi: c?.unvan || '' };
    }
    const name = taseronManuel.trim();
    if (!name) return { taseronAdi: '' };
    // Elle yazılsa bile cari unvanıyla eşleştir (Demirkaan vb.)
    const match =
      taseronCariler.find((c) => firmaEslesir(c.unvan, name)) ||
      cariKartlar.find((c) => firmaEslesir(c.unvan, name));
    return {
      cariKartId: match?.id,
      taseronAdi: match?.unvan || name,
    };
  };

  const resolveMuhatapLabel = (ht: HazirTutanak): string => {
    if (ht.muhatapPersonel?.trim()) return ht.muhatapPersonel.trim();
    const p = personeller.find((x) => x.id === ht.personelId);
    if (p) return `${p.ad} ${p.soyad}`;
    return '';
  };

  const appendCariHistory = (tutanak: HazirTutanak, action: 'create' | 'edit' | 'delete') => {
    if (!setCariIslemGecmisi || !tutanak.cariKartId) return;
    const islem: CariKartIslem = {
      id: `cari_islem_teslim_${tutanak.id}_${action}_${Date.now()}`,
      cariKartId: tutanak.cariKartId,
      islemTipi: 'DIGER',
      islemId: tutanak.id,
      islemBaslik:
        action === 'delete'
          ? 'Malzeme Teslim Tutanağı Silindi'
          : action === 'edit'
            ? 'Malzeme Teslim Tutanağı Güncellendi'
            : 'Malzeme Teslim Tutanağı',
      islemDetay: `${tutanak.belgeNo} · ${tutanak.tarih} · ${(tutanak.kalemler || []).length} kalem · ${tutanak.taseronAdi || ''}`,
      tarih: tutanak.tarih,
      belgeNo: tutanak.belgeNo,
    };
    setCariIslemGecmisi((prev) => [islem, ...prev]);
  };

  const resetForm = (keepType = true) => {
    setEditingTutanakId(null);
    setTutanakSubject(keepType && tutanakType === 'TESLİM' ? 'Malzeme Teslim Tutanağı' : '');
    setTutanakPerson('');
    setMuhatapManuel('');
    setTutanakText('');
    setTutanakTarih(todayDateKey());
    setTaseronKaynak('');
    setTaseronManuel('');
    setCezaTutari(0);
    setKalemler([emptyKalem()]);
    setTeslimEden('');
    setTeslimAlan('');
  };

  const handleTypeChange = (next: HazirTutanak['tutanakTipi']) => {
    setTutanakType(next);
    if (next === 'TESLİM' && !editingTutanakId) {
      setTutanakSubject((s) => s.trim() || 'Malzeme Teslim Tutanağı');
      if (kalemler.length === 0) setKalemler([emptyKalem()]);
    }
  };

  const updateKalem = (id: string, patch: Partial<MalzemeTeslimKalem>) => {
    setKalemler((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  };

  const applyStokSuggestion = (kalemId: string, malzemeAdi: string) => {
    const match = aktifStoklar.find(
      (s) => s.stokAdi.toLocaleLowerCase('tr-TR') === malzemeAdi.toLocaleLowerCase('tr-TR')
    );
    updateKalem(kalemId, {
      malzemeAdi,
      ...(match
        ? { cinsi: match.birim || 'Adet', stokKartId: match.id }
        : { stokKartId: undefined }),
    });
  };

  const handleSaveTutanak = () => {
    const isTeslim = tutanakType === 'TESLİM';
    const { cariKartId, taseronAdi } = resolveTaseron();

    if (isTeslim) {
      const validKalemler = kalemler.filter((k) => String(k.malzemeAdi || '').trim());
      if (!tutanakTarih) {
        alert('Tarih zorunludur.');
        return;
      }
      if (validKalemler.length === 0) {
        alert('En az bir malzeme satırı girin (Malzeme Adı).');
        return;
      }
      if (!taseronAdi) {
        alert('Taşeron firma seçin veya elle yazın (cari altına kaydedilir).');
        return;
      }

      const konu = tutanakSubject.trim() || 'Malzeme Teslim Tutanağı';
      const icerikOzet = validKalemler
        .map(
          (k, i) =>
            `${i + 1}) ${k.malzemeAdi} — ${k.miktar || '—'} ${k.cinsi || ''}${k.aciklama ? ` (${k.aciklama})` : ''}`
        )
        .join('\n');

      if (editingTutanakId) {
        setHazirTutanaklar((prev) =>
          prev.map((ht) => {
            if (ht.id !== editingTutanakId) return ht;
            const updated: HazirTutanak = {
              ...ht,
              tutanakTipi: 'TESLİM',
              personelId: tutanakPerson || undefined,
              muhatapPersonel: muhatapManuel.trim() || undefined,
              konu,
              tarih: tutanakTarih,
              icerik: tutanakText.trim() || icerikOzet,
              aciklama: ht.aciklama || 'Malzeme teslim tutanağı',
              taseronAdi,
              cariKartId: cariKartId || ht.cariKartId,
              kalemler: validKalemler.map((k) => ({
                ...k,
                malzemeAdi: k.malzemeAdi.trim(),
                miktar: k.miktar === '' ? '' : Number(k.miktar) || k.miktar,
                cinsi: String(k.cinsi || '').trim() || 'Adet',
                aciklama: String(k.aciklama || '').trim(),
              })),
              teslimEden: teslimEden.trim() || undefined,
              teslimAlan: teslimAlan.trim() || undefined,
            };
            appendCariHistory(updated, 'edit');
            return updated;
          })
        );
        alert('Malzeme teslim tutanağı güncellendi.');
      } else {
        const docNo = `TUT-TES-${Date.now().toString().slice(-6)}`;
        const newDoc: HazirTutanak = {
          id: `t_${Date.now()}`,
          tutanakTipi: 'TESLİM',
          belgeNo: docNo,
          personelId: tutanakPerson || undefined,
          muhatapPersonel: muhatapManuel.trim() || undefined,
          konu,
          tarih: tutanakTarih,
          icerik: tutanakText.trim() || icerikOzet,
          durum: 'TASLAK',
          aciklama: 'Malzeme teslim tutanağı — stok güncellenmez.',
          taseronAdi,
          cariKartId,
          kalemler: validKalemler.map((k) => ({
            ...k,
            malzemeAdi: k.malzemeAdi.trim(),
            miktar: k.miktar === '' ? '' : Number(k.miktar) || k.miktar,
            cinsi: String(k.cinsi || '').trim() || 'Adet',
            aciklama: String(k.aciklama || '').trim(),
          })),
          teslimEden: teslimEden.trim() || undefined,
          teslimAlan: teslimAlan.trim() || undefined,
        };
        setHazirTutanaklar((prev) => [newDoc, ...prev]);
        appendCariHistory(newDoc, 'create');
        alert(`${docNo} kaydedildi. Arşivde listelenir; taşeron cari altına bağlandı.`);
      }
      resetForm();
      return;
    }

    // Diğer tutanak tipleri
    if (!tutanakSubject.trim() || !tutanakText.trim()) {
      alert('Lütfen tutanak konusu ve metin içeriğini doldurun.');
      return;
    }

    if (editingTutanakId) {
      setHazirTutanaklar((prev) =>
        prev.map((ht) =>
          ht.id === editingTutanakId
            ? {
                ...ht,
                tutanakTipi: tutanakType,
                personelId: tutanakPerson || undefined,
                muhatapPersonel: muhatapManuel.trim() || undefined,
                konu: tutanakSubject.trim(),
                tarih: tutanakTarih,
                icerik: tutanakText.trim(),
                taseronAdi: taseronAdi || undefined,
                cariKartId: cariKartId || ht.cariKartId,
                cezaTutari: cezaTutari,
              }
            : ht
        )
      );
      alert('Tutanak güncellendi.');
    } else {
      const docNo = `TUT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const newDoc: HazirTutanak = {
        id: `t_${Date.now()}`,
        tutanakTipi: tutanakType,
        belgeNo: docNo,
        personelId: tutanakPerson || undefined,
        muhatapPersonel: muhatapManuel.trim() || undefined,
        konu: tutanakSubject.trim(),
        tarih: tutanakTarih,
        icerik: tutanakText.trim(),
        durum: 'TASLAK',
        aciklama: 'Yeni tutanak taslağı açıldı.',
        taseronAdi: taseronAdi || undefined,
        cariKartId,
        cezaTutari: tutanakType === 'CEZA' ? cezaTutari : undefined,
      };
      setHazirTutanaklar((prev) => [newDoc, ...prev]);
      alert(`${docNo} numaralı tutanak kaydedildi.`);
    }
    resetForm(false);
  };

  const handleStartEditTutanak = (ht: HazirTutanak) => {
    setEditingTutanakId(ht.id);
    setTutanakType(ht.tutanakTipi);
    setTutanakSubject(ht.konu);
    setTutanakPerson(ht.personelId || '');
    setMuhatapManuel(ht.muhatapPersonel || '');
    setTutanakText(ht.icerik);
    setTutanakTarih(ht.tarih || todayDateKey());
    setCezaTutari(ht.cezaTutari || 0);
    setTeslimEden(ht.teslimEden || '');
    setTeslimAlan(ht.teslimAlan || '');
    setKalemler(ht.kalemler?.length ? ht.kalemler.map((k) => ({ ...k })) : [emptyKalem()]);

    if (ht.cariKartId && taseronCariler.some((c) => c.id === ht.cariKartId)) {
      setTaseronKaynak(ht.cariKartId);
      setTaseronManuel('');
    } else if (ht.taseronAdi) {
      const match = taseronCariler.find((c) => c.unvan === ht.taseronAdi);
      if (match) {
        setTaseronKaynak(match.id);
        setTaseronManuel('');
      } else {
        setTaseronKaynak('MANUEL');
        setTaseronManuel(ht.taseronAdi);
      }
    } else {
      setTaseronKaynak('');
      setTaseronManuel('');
    }
  };

  const handleDeleteTutanak = (id: string) => {
    if (deleteConfirmTutanakId === id) {
      const existing = hazirTutanaklar.find((t) => t.id === id);
      if (existing?.tutanakTipi === 'TESLİM') appendCariHistory(existing, 'delete');
      setHazirTutanaklar((prev) => prev.filter((t) => t.id !== id));
      setDeleteConfirmTutanakId(null);
      if (editingTutanakId === id) resetForm();
    } else {
      setDeleteConfirmTutanakId(id);
      setTimeout(() => {
        setDeleteConfirmTutanakId((prev) => (prev === id ? null : prev));
      }, 4000);
    }
  };

  const handlePrintReport = (ht: HazirTutanak) => {
    const muhatap = resolveMuhatapLabel(ht);
    const isTeslim = ht.tutanakTipi === 'TESLİM';
    const rows = (ht.kalemler || [])
      .map(
        (k, i) => `
      <tr>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:center;font-family:monospace">${i + 1}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:600">${cell(k.malzemeAdi)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace">${cell(k.miktar)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1">${cell(k.cinsi)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1">${cell(k.aciklama)}</td>
      </tr>`
      )
      .join('');

    const teslimAlanAd = (ht.teslimAlan || muhatap || '').trim();

    const body = isTeslim
      ? `
      <div style="margin-bottom:16px">
        <h2 style="font-size:18px;font-weight:800;margin:0;letter-spacing:.02em">MALZEME TESLİM TUTANAĞI</h2>
        <p style="font-size:11px;color:#64748b;margin:4px 0 0">Kibritçi İnşaat — taşeron / şantiye malzeme teslimi</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:12px">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc">
          <p style="margin:0 0 6px;font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Belge</p>
          <p style="margin:0"><strong>Belge No:</strong> ${ht.belgeNo}</p>
          <p style="margin:4px 0 0"><strong>Tarih:</strong> ${ht.tarih}</p>
          <p style="margin:4px 0 0"><strong>Konu:</strong> ${ht.konu}</p>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc">
          <p style="margin:0 0 6px;font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Muhatap</p>
          <p style="margin:0"><strong>Taşeron Firma:</strong> ${ht.taseronAdi || ''}</p>
          <p style="margin:4px 0 0"><strong>Muhatap Personel:</strong> ${muhatap || ''}</p>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px;border:1px solid #cbd5e1;width:40px">#</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Malzeme Adı</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:right;width:90px">Miktar</th>
            <th style="padding:8px;border:1px solid #cbd5e1;width:90px">Cinsi</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Açıklama</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5" style="padding:12px;border:1px solid #cbd5e1;text-align:center;color:#94a3b8">Kalem yok</td></tr>`}
        </tbody>
      </table>
      ${
        ht.icerik
          ? `<p style="font-size:12px;color:#475569;margin:0 0 20px;white-space:pre-wrap"><strong>Not:</strong> ${ht.icerik}</p>`
          : ''
      }
      <p style="font-size:11px;font-style:italic;color:#64748b;margin:0 0 24px">
        İşbu tutanak ${ht.tarih} tarihinde tanzim edilmiş olup, aşağıda imzaları bulunan taraflarca okunarak kabul edilmiştir.
        Bu belge stok kartı miktarını güncellemez; yalnızca teslim kaydıdır.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:110px;text-align:center">
          <p style="margin:0;font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b">Teslim Eden</p>
          <div style="height:28px"></div>
          <div style="margin-top:40px;font-size:10px;color:#64748b">İmza</div>
        </div>
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:110px;text-align:center">
          <p style="margin:0;font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b">Teslim Alan</p>
          ${teslimAlanAd ? `<p style="margin:8px 0 0;font-size:12px;font-weight:700">${teslimAlanAd}</p>` : `<div style="height:28px"></div>`}
          <div style="margin-top:40px;font-size:10px;color:#64748b">İmza</div>
        </div>
      </div>
    `
      : `
      <h2 style="font-size:16px;font-weight:800;margin:0 0 8px">RESMİ ŞANTİYE TUTANAĞI</h2>
      <p style="font-size:11px;color:#64748b;margin:0 0 16px">${ht.tutanakTipi} · ${ht.belgeNo} · ${ht.tarih}</p>
      <p style="font-size:13px;font-weight:700;margin:0 0 8px">${ht.konu}</p>
      ${
        ht.tutanakTipi === 'CEZA'
          ? `<p style="font-size:12px"><strong>Taşeron:</strong> ${ht.taseronAdi || '—'} · <strong>Ceza:</strong> ₺${(ht.cezaTutari || 0).toLocaleString('tr-TR')}</p>`
          : ''
      }
      <p style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin:16px 0">${ht.icerik}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:32px">
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:100px;text-align:center">
          <p style="margin:0;font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b">Muhatap / Teslim Alan</p>
          <p style="margin:8px 0 0;font-size:12px;font-weight:700">${muhatap}</p>
        </div>
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:14px;min-height:100px;text-align:center">
          <p style="margin:0;font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b">Şantiye Şefi / Yetkili</p>
          <p style="margin:8px 0 0;font-size:12px;font-weight:700">Şantiye Yönetimi</p>
        </div>
      </div>
    `;

    const html = wrapCorporateReportHtml(body, {
      docCode: ht.belgeNo,
      orientation: 'portrait',
      title: `${ht.belgeNo} — ${ht.konu}`,
      autoPrint: false,
    });
    installReportEmailGlobalBridge();
    const w = window.open('', '_blank');
    if (!w) {
      alert('Pop-up engellendi. Rapor için tarayıcıda pencereye izin verin.');
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const handleEmailReport = (ht: HazirTutanak) => {
    const muhatap = resolveMuhatapLabel(ht);
    const kalemOzet = (ht.kalemler || [])
      .map(
        (k, i) =>
          `${i + 1}) ${k.malzemeAdi} · ${k.miktar ?? ''} ${k.cinsi || ''}${k.aciklama ? ` (${k.aciklama})` : ''}`
      )
      .join('\n');
    openReportEmailComposer({
      subject: `Kibritçi — ${ht.belgeNo} ${ht.konu}`,
      body: `${ht.tutanakTipi} tutanağı\nBelge: ${ht.belgeNo}\nTarih: ${ht.tarih}\nTaşeron: ${ht.taseronAdi || '-'}\nMuhatap: ${muhatap || '-'}\n\n${kalemOzet || ht.icerik || ''}`,
      fileName: `${ht.belgeNo}.html`,
    });
  };

  const filtered = useMemo(() => {
    const kw = tutanakSearch.toLowerCase().trim();
    return (hazirTutanaklar || []).filter((ht) => {
      if (!kw) return true;
      const kalemBlob = (ht.kalemler || []).map((k) => k.malzemeAdi).join(' ');
      return (
        ht.belgeNo.toLowerCase().includes(kw) ||
        ht.konu.toLowerCase().includes(kw) ||
        (ht.icerik || '').toLowerCase().includes(kw) ||
        ht.tutanakTipi.toLowerCase().includes(kw) ||
        (ht.taseronAdi || '').toLowerCase().includes(kw) ||
        (ht.tarih || '').includes(kw) ||
        kalemBlob.toLowerCase().includes(kw) ||
        (ht.teslimEden || '').toLowerCase().includes(kw) ||
        (ht.teslimAlan || '').toLowerCase().includes(kw)
      );
    });
  }, [hazirTutanaklar, tutanakSearch]);

  const isTeslimForm = tutanakType === 'TESLİM';

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0 h-full">
      {/* Creator */}
      <div className="w-full lg:w-[420px] lg:shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
        <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
          <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Hukuki Belgeler</span>
          <h3 className="font-display font-semibold text-sm">📜 Yeni Tutanak Oluştur</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Tutanak Şablon Tipi</label>
            <select
              className="w-full text-xs font-bold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
              value={tutanakType}
              onChange={(e) => handleTypeChange(e.target.value as HazirTutanak['tutanakTipi'])}
            >
              <option value="TESLİM">Malzeme Teslim Tutanağı</option>
              <option value="TAHSİS">Tahsis / Zimmet Tutanağı</option>
              <option value="SEVK">Sevk / Sevkiyat Tutanağı</option>
              <option value="HASAR">Zarar / Hasar Tespit Protokolü</option>
              <option value="GENEL">Normal Şantiye Genel Tutanağı</option>
              <option value="CEZA">Ceza İhtar Tutanağı</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Tarih *</label>
            <input
              type="date"
              className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
              value={tutanakTarih}
              onChange={(e) => setTutanakTarih(e.target.value)}
            />
          </div>

          {(isTeslimForm || tutanakType === 'CEZA') && (
            <div className="space-y-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
              <span className="font-bold text-[9px] text-amber-900 uppercase tracking-widest block">
                Taşeron Firma (DB veya Elle)
              </span>
              <select
                className="w-full text-xs font-semibold p-2 bg-white border border-[#e2e8f0] rounded-lg"
                value={taseronKaynak}
                onChange={(e) => {
                  setTaseronKaynak(e.target.value);
                  if (e.target.value !== 'MANUEL') setTaseronManuel('');
                }}
              >
                <option value="">-- Taşeron Seç (Cari) --</option>
                {(isTeslimForm ? firmaSecenekleri : taseronCariler).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.unvan}
                    {c.kartTipi === 'TASERON' ? '' : ` (${c.kartTipi})`}
                  </option>
                ))}
                <option value="MANUEL">Elle yazacağım…</option>
              </select>
              {(taseronKaynak === 'MANUEL' || !taseronKaynak) && (
                <input
                  type="text"
                  placeholder="Elle taşeron unvanı"
                  className="w-full text-xs font-semibold p-2 bg-white border border-[#e2e8f0] rounded-lg"
                  value={taseronManuel}
                  onChange={(e) => {
                    setTaseronManuel(e.target.value);
                    if (e.target.value.trim()) setTaseronKaynak('MANUEL');
                  }}
                />
              )}
              {isTeslimForm && (
                <p className="text-[9px] text-amber-800/80">
                  Kayıt seçilen firmanın cari kartı altına ve Taşeron → Rapor Arşivi’ne düşer.
                </p>
              )}
              {tutanakType === 'CEZA' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Ceza Tutarı (₺)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full text-xs font-semibold mt-1 p-2 bg-white border border-[#e2e8f0] rounded-lg"
                    value={cezaTutari || ''}
                    onChange={(e) => setCezaTutari(parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Tutanak Konusu / Başlığı *</label>
            <input
              type="text"
              className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
              value={tutanakSubject}
              onChange={(e) => setTutanakSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Muhatap Personel (DB / Elle / Boş)
            </label>
            <select
              className="w-full text-xs font-semibold p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
              value={tutanakPerson}
              onChange={(e) => {
                setTutanakPerson(e.target.value);
                if (e.target.value) setMuhatapManuel('');
              }}
            >
              <option value="">-- Seçilmedi / Elle yaz --</option>
              {personeller.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ad} {p.soyad} ({p.gorev})
                </option>
              ))}
            </select>
            {!tutanakPerson && (
              <input
                type="text"
                placeholder="Elle muhatap adı (opsiyonel)"
                className="w-full text-xs font-semibold p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                value={muhatapManuel}
                onChange={(e) => setMuhatapManuel(e.target.value)}
              />
            )}
          </div>

          {isTeslimForm ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Malzeme Listesi (Excel tarzı)
                  </label>
                  <button
                    type="button"
                    onClick={() => setKalemler((prev) => [...prev, emptyKalem()])}
                    className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg cursor-pointer"
                  >
                    <Plus size={11} /> Satır
                  </button>
                </div>
                <p className="text-[9px] text-slate-400">
                  Stok kartı varsa isim önerilir; <strong>stok miktarı güncellenmez</strong>.
                </p>
                <datalist id="stok-malzeme-onerileri">
                  {aktifStoklar.map((s) => (
                    <option key={s.id} value={s.stokAdi} />
                  ))}
                </datalist>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-[10px]">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-1.5 text-left">Malzeme Adı</th>
                        <th className="p-1.5 w-16">Miktar</th>
                        <th className="p-1.5 w-16">Cinsi</th>
                        <th className="p-1.5 text-left">Açıklama</th>
                        <th className="p-1.5 w-7" />
                      </tr>
                    </thead>
                    <tbody>
                      {kalemler.map((k) => (
                        <tr key={k.id} className="border-t border-slate-100">
                          <td className="p-1">
                            <input
                              list="stok-malzeme-onerileri"
                              className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 font-semibold"
                              value={k.malzemeAdi}
                              placeholder="Öneri için yazın…"
                              onChange={(e) => applyStokSuggestion(k.id, e.target.value)}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 font-mono"
                              value={k.miktar}
                              onChange={(e) => updateKalem(k.id, { miktar: e.target.value })}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className="w-full bg-white border border-slate-200 rounded px-1.5 py-1"
                              value={k.cinsi}
                              placeholder="Adet"
                              onChange={(e) => updateKalem(k.id, { cinsi: e.target.value })}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className="w-full bg-white border border-slate-200 rounded px-1.5 py-1"
                              value={k.aciklama}
                              onChange={(e) => updateKalem(k.id, { aciklama: e.target.value })}
                            />
                          </td>
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              disabled={kalemler.length <= 1}
                              onClick={() => setKalemler((prev) => prev.filter((x) => x.id !== k.id))}
                              className="text-rose-500 disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Teslim Eden</label>
                  <input
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    placeholder="Ad Soyad (opsiyonel)"
                    value={teslimEden}
                    onChange={(e) => setTeslimEden(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Teslim Alan</label>
                  <input
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    placeholder="Ad Soyad (opsiyonel)"
                    value={teslimAlan}
                    onChange={(e) => setTeslimAlan(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Ek Not (opsiyonel)</label>
                <textarea
                  className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none"
                  rows={3}
                  value={tutanakText}
                  onChange={(e) => setTutanakText(e.target.value)}
                  placeholder="Varsa ek açıklama…"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Tutanak Metin İçeriği *</label>
              <textarea
                className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none font-sans"
                rows={6}
                value={tutanakText}
                onChange={(e) => setTutanakText(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-slate-50 space-y-2">
          <button
            type="button"
            onClick={handleSaveTutanak}
            className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer"
          >
            {editingTutanakId ? 'Kaydet / Güncelle' : 'Kaydet'}
          </button>
          {editingTutanakId && (
            <button
              type="button"
              onClick={() => resetForm()}
              className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 rounded-xl cursor-pointer"
            >
              Düzenlemeyi İptal
            </button>
          )}
        </div>
      </div>

      {/* Archive list */}
      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 space-y-2.5">
          <div className="flex items-center space-x-2">
            <FileText size={16} className="text-[#2563EB]" />
            <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
              Tutanak Arşivi
            </h4>
          </div>
          <input
            type="text"
            placeholder="Belge no, tarih, taşeron, malzeme adı ara…"
            value={tutanakSearch}
            onChange={(e) => setTutanakSearch(e.target.value)}
            className="w-full bg-white text-xs text-slate-800 border border-slate-250 rounded-lg py-1.5 px-3 placeholder-slate-400 font-medium"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filtered.length === 0 && (
            <p className="text-center text-slate-400 text-xs py-12">Arşivde kayıt yok / arama sonucu boş.</p>
          )}
          {filtered.map((ht) => {
            const muhatap = resolveMuhatapLabel(ht);
            return (
              <div
                key={ht.id}
                className="border border-slate-150 rounded-xl p-5 bg-white space-y-3 hover:shadow transition"
              >
                <div className="flex justify-between items-center text-xs border-b pb-2.5">
                  <div>
                    <span className="font-mono bg-slate-100 rounded px-2.5 py-0.5 text-slate-700 font-bold border border-slate-200">
                      {ht.belgeNo}
                    </span>
                    <p className="text-[9px] text-[#2563EB] font-bold mt-1.5 uppercase">
                      TİP: {ht.tutanakTipi} · {ht.tarih}
                    </p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    {ht.durum}
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-xs">{ht.konu}</h4>
                  {ht.taseronAdi && (
                    <p className="text-[11px] text-slate-600">
                      Taşeron: <strong>{ht.taseronAdi}</strong>
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Muhatap: <strong className="text-slate-700">{muhatap}</strong>
                  </p>
                </div>

                {ht.tutanakTipi === 'TESLİM' && (ht.kalemler || []).length > 0 ? (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-[10px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="p-2 text-left">Malzeme</th>
                          <th className="p-2 text-right">Miktar</th>
                          <th className="p-2">Cinsi</th>
                          <th className="p-2 text-left">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ht.kalemler || []).map((k) => (
                          <tr key={k.id} className="border-t">
                            <td className="p-2 font-semibold">{k.malzemeAdi}</td>
                            <td className="p-2 text-right font-mono">{k.miktar}</td>
                            <td className="p-2 text-center">{k.cinsi}</td>
                            <td className="p-2 text-slate-500">{k.aciklama || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 bg-slate-50 border p-3 rounded-lg italic line-clamp-4">
                    &ldquo;{ht.icerik}&rdquo;
                  </p>
                )}

                {ht.tutanakTipi === 'TESLİM' && (
                  <p className="text-[10px] text-slate-500">
                    Teslim Eden: <strong>{ht.teslimEden || '—'}</strong> · Teslim Alan:{' '}
                    <strong>{ht.teslimAlan || '—'}</strong>
                  </p>
                )}

                {ht.imzaliEvrakUrl && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-32">
                    <img src={ht.imzaliEvrakUrl} alt="İmzalı" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t text-[10px]">
                  <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer">
                    <Upload size={11} />
                    <span>{ht.imzaliEvrakUrl ? 'İmza Güncelle' : 'İmzalı Yükle'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          const compressed = await compressImage(reader.result as string);
                          setHazirTutanaklar((prev) =>
                            prev.map((item) =>
                              item.id === ht.id
                                ? { ...item, imzaliEvrakUrl: compressed, durum: 'ONAYLANDI' }
                                : item
                            )
                          );
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleEmailReport(ht)}
                    className="bg-sky-600 text-white font-bold py-1 px-2.5 rounded-lg cursor-pointer flex items-center gap-1"
                  >
                    <Send size={11} /> E-posta
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartEditTutanak(ht)}
                    className="bg-amber-50 text-amber-800 font-bold py-1 px-2.5 rounded-lg cursor-pointer"
                  >
                    Düzenle
                  </button>

                  {deleteConfirmTutanakId === ht.id ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteTutanak(ht.id)}
                      className="bg-red-600 text-white font-extrabold py-1 px-2.5 rounded-lg animate-pulse cursor-pointer"
                    >
                      Emin misiniz? Sil
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDeleteTutanak(ht.id)}
                      className="bg-rose-50 text-rose-700 font-bold py-1 px-2.5 rounded-lg cursor-pointer"
                    >
                      Sil
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePrintReport(ht)}
                    className="bg-slate-800 text-white font-bold py-1 px-3 rounded-lg cursor-pointer inline-flex items-center gap-1"
                  >
                    <Printer size={11} /> Antetli Rapor
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HazirTutanakTab;
