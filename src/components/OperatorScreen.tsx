import React, { useState, useMemo } from 'react';
import { HardHat, Clock, Calendar, Building2, Camera, Save, Search, FileText, Trash2, CreditCard as Edit3, CircleCheck as CheckCircle, X, ChevronDown, ChevronUp, Truck, TriangleAlert as AlertTriangle, Download, Mail, ListFilter as Filter, Plus, Printer } from 'lucide-react';
import { AracBakim, AylikYoklamaMap, CariKart, CariKartIslem, OperatorFaaliyet, TaseronKesintiRaporu, Personel } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { getTaseronCariKartlar, buildOperatorIsKaydiEtiketi, makineEtiketi, cariIslemIdForOperatorFaaliyet, resolveMakineKaynakGrup, makineKaynakGrupLabel } from '../lib/taseronUtils';
import { indirIsMakinesiRaporu } from '../lib/taseronReportUtils';
import { kibritciLogoHtml } from '../lib/kibritciBrand';
import { isOperatorGorev } from '../lib/yoklamaUtils';
import { RolMobilFaaliyetYoklamaPanel } from './RolMobilFaaliyetYoklamaPanel';
import { KampGunlukYoklamaTab } from './KampGunlukYoklamaTab';

/** Ağustos 2026 ve sonrası: kanıt foto zorunlu. Temmuz ve öncesi geçmiş doldurma için opsiyonel. */
const KANIT_FOTO_ZORUNLU_BASLANGIC = '2026-08-01';

interface OperatorScreenProps {
  araclar: AracBakim[];
  personeller: Personel[];
  cariKartlar: CariKart[];
  operatorFaaliyetleri: OperatorFaaliyet[];
  setOperatorFaaliyetleri: React.Dispatch<React.SetStateAction<OperatorFaaliyet[]>>;
  taseronKesintiRaporlari: TaseronKesintiRaporu[];
  setTaseronKesintiRaporlari: React.Dispatch<React.SetStateAction<TaseronKesintiRaporu[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  currentUser: any;
  addNotification?: (mesaj: string) => void;
  yoklamalar?: AylikYoklamaMap;
  setYoklamalar?: (updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)) => void;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  onSignOut?: () => void;
  isStandalone?: boolean;
}

export const OperatorScreen: React.FC<OperatorScreenProps> = ({
  araclar,
  personeller,
  cariKartlar,
  operatorFaaliyetleri,
  setOperatorFaaliyetleri,
  taseronKesintiRaporlari,
  setTaseronKesintiRaporlari,
  setCariIslemGecmisi,
  currentUser,
  addNotification,
  yoklamalar = {},
  setYoklamalar,
  saveYoklamalarNow,
  onSignOut,
  isStandalone = false,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'faaliyet' | 'saha_faaliyet' | 'yoklama' | 'rapor' | 'arsiv'
  >('saha_faaliyet');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAracId, setSelectedAracId] = useState('');
  const [selectedPersonelId, setSelectedPersonelId] = useState('');
  const [operatorTipi, setOperatorTipi] = useState<'JCB' | 'KATO' | 'KİRALIK' | 'DİĞER'>('JCB');
  const [tarih, setTarih] = useState(new Date().toISOString().split('T')[0]);
  const [baslangicSaat, setBaslangicSaat] = useState('08:00');
  const [bitisSaat, setBitisSaat] = useState('17:00');
  const [yapilanIs, setYapilanIs] = useState('');
  const [firmaSecim, setFirmaSecim] = useState<'cari' | 'manuel'>('cari');
  const [selectedCariId, setSelectedCariId] = useState('');
  const [manuelFirma, setManuelFirma] = useState('');
  const [temsilciAdSoyad, setTemsilciAdSoyad] = useState('');
  const [temsilciTc, setTemsilciTc] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKesintiModal, setShowKesintiModal] = useState(false);
  const [selectedAy, setSelectedAy] = useState(new Date().getMonth() + 1);
  const [selectedYil, setSelectedYil] = useState(new Date().getFullYear());
  const [makineKaynak, setMakineKaynak] = useState<'DEMIRBAS' | 'KIRALIK' | 'MANUEL'>('DEMIRBAS');
  const [makineManuelAd, setMakineManuelAd] = useState('');
  const [raporFiltreFirma, setRaporFiltreFirma] = useState('');
  const [raporFiltreAy, setRaporFiltreAy] = useState(new Date().getMonth() + 1);
  const [raporFiltreYil, setRaporFiltreYil] = useState(new Date().getFullYear());

  const taseronCariler = useMemo(() => getTaseronCariKartlar(cariKartlar), [cariKartlar]);

  const operatorPersoneller = useMemo(
    () =>
      personeller
        .filter((p) => p.durum !== false && isOperatorGorev(p.gorev))
        .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')),
    [personeller]
  );

  const canliIsKaydiEtiketi = useMemo(() => {
    const arac = araclar.find((a) => a.id === selectedAracId);
    return buildOperatorIsKaydiEtiketi({
      makineKaynak,
      operatorTipi,
      makineManuelAd: makineKaynak === 'MANUEL' ? makineManuelAd : undefined,
      aracPlaka: makineKaynak === 'MANUEL' ? makineManuelAd : arac?.plaka,
    });
  }, [makineKaynak, operatorTipi, makineManuelAd, selectedAracId, araclar]);

  const ismakineAraclari = useMemo(() => {
    return araclar.filter(a =>
      a.tur === 'İŞ MAKİNESİ' ||
      a.markaModel?.toLowerCase().includes('excavator') ||
      a.markaModel?.toLowerCase().includes('jcb') ||
      a.markaModel?.toLowerCase().includes('kato') ||
      a.plaka?.toLowerCase().includes('exc')
    );
  }, [araclar]);

  const filteredFaaliyetler = useMemo(() => {
    let list = operatorFaaliyetleri;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => 
        f.operatorIsim.toLowerCase().includes(q) ||
        f.yapilanIs.toLowerCase().includes(q) ||
        f.firmaAdi.toLowerCase().includes(q) ||
        f.aracPlaka?.toLowerCase().includes(q) ||
        makineEtiketi(f).toLowerCase().includes(q) ||
        String(f.isKaydiEtiketi || '').toLowerCase().includes(q) ||
        String(f.operatorTipi || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
  }, [operatorFaaliyetleri, searchQuery]);

  const hesaplaCalismaSuresi = (bas: string, bit: string): number => {
    const [basSaat, basDakika] = bas.split(':').map(Number);
    const [bitSaat, bitDakika] = bit.split(':').map(Number);
    const basDakikaToplam = basSaat * 60 + basDakika;
    const bitDakikaToplam = bitSaat * 60 + bitDakika;
    const fark = bitDakikaToplam - basDakikaToplam;
    return Math.max(0, fark / 60);
  };

  const handleFotoYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1200, 0.7);
      setFotoUrl(compressed);
    } catch (err) {
      alert('Fotoğraf sıkıştırılırken hata oluştu.');
    }
  };

  const handleKaydet = () => {
    if (!selectedPersonelId || !yapilanIs.trim()) {
      alert('Lütfen operatör ve yapılan iş (açıklama) alanlarını doldurun.');
      return;
    }
    if (makineKaynak === 'MANUEL' && !makineManuelAd.trim()) {
      alert('Elle giriş için makine adı/plaka girin.');
      return;
    }
    if (makineKaynak !== 'MANUEL' && !selectedAracId) {
      alert('Lütfen iş makinesi seçin.');
      return;
    }
    if (firmaSecim === 'cari' && !selectedCariId) {
      alert('Taşeron firma seçin. Kesinti kaydı ilgili cari geçmişine yazılır.');
      return;
    }
    if (firmaSecim === 'manuel' && !manuelFirma.trim()) {
      alert('Firma adı girin veya cari karttan taşeron seçin.');
      return;
    }
    const fotoZorunlu = String(tarih || '') >= KANIT_FOTO_ZORUNLU_BASLANGIC;
    if (fotoZorunlu && !fotoUrl) {
      alert('Taşeron kesinti kaydı için kanıt fotoğrafı zorunludur (Ağustos 2026 ve sonrası).');
      return;
    }

    const arac = araclar.find(a => a.id === selectedAracId);
    const personel = personeller.find(p => p.id === selectedPersonelId);
    const calismaSuresi = hesaplaCalismaSuresi(baslangicSaat, bitisSaat);

    if (calismaSuresi <= 0) {
      alert('Bitiş saati başlangıç saatinden sonra olmalıdır.');
      return;
    }

    const firmaAdi = firmaSecim === 'cari' 
      ? (cariKartlar.find(c => c.id === selectedCariId)?.unvan || 'Bilinmeyen Firma')
      : manuelFirma.trim();

    const firmaId = firmaSecim === 'cari' ? selectedCariId : undefined;

    // Makine kaynağı kullanıcı seçimiyle kalır; tip yalnızca etiket (JCB/KATO/…)
    const kaynak: OperatorFaaliyet['makineKaynak'] = makineKaynak;
    const aracPlaka =
      makineKaynak === 'MANUEL' ? makineManuelAd : arac?.plaka;
    const isKaydiEtiketi = buildOperatorIsKaydiEtiketi({
      makineKaynak: kaynak,
      operatorTipi,
      makineManuelAd: makineKaynak === 'MANUEL' ? makineManuelAd : undefined,
      aracPlaka,
    });

    const yeniFaaliyet: OperatorFaaliyet = {
      id: editingId || `of_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      aracId: makineKaynak === 'MANUEL' ? `manuel_${Date.now()}` : selectedAracId,
      aracPlaka,
      operatorPersonelId: selectedPersonelId,
      operatorIsim: `${personel?.ad} ${personel?.soyad}`,
      operatorTipi,
      tarih,
      baslangicSaat,
      bitisSaat,
      calismaSuresi: Math.round(calismaSuresi * 100) / 100,
      yapilanIs: yapilanIs.trim(),
      firmaAdi,
      firmaId,
      isManualFirma: firmaSecim === 'manuel',
      fotoUrl: fotoUrl || undefined,
      temsilciAdSoyad: temsilciAdSoyad || undefined,
      temsilciTc: temsilciTc || undefined,
      operatorTc: personel?.tcNo,
      makineKaynak: kaynak,
      makineManuelAd: makineKaynak === 'MANUEL' ? makineManuelAd : undefined,
      isKaydiEtiketi,
      onayDurumu: 'BEKLEMEDE',
      durum: 'ONAY BEKLİYOR',
      kaydedenKullanici: currentUser?.email,
      kayitTarihi: new Date().toISOString()
    };

    if (editingId) {
      setOperatorFaaliyetleri(prev => prev.map(f => f.id === editingId ? yeniFaaliyet : f));
    } else {
      setOperatorFaaliyetleri(prev => [...prev, yeniFaaliyet]);
    }

    // Cari geçmişe yalnızca Onay Havuzu onayı sonrası yazılır
    if (setCariIslemGecmisi) {
      const cid = cariIslemIdForOperatorFaaliyet(yeniFaaliyet.id);
      setCariIslemGecmisi((prev) => (prev || []).filter((x) => x.id !== cid && x.islemId !== yeniFaaliyet.id));
    }

    if (addNotification) {
      addNotification(
        `Taşeron kesinti (onay bekliyor): ${isKaydiEtiketi} · ${personel?.ad} ${personel?.soyad} | ${calismaSuresi.toFixed(1)} sa · ${firmaAdi}`
      );
    }

    // Reset form
    setYapilanIs('');
    setTemsilciAdSoyad('');
    setTemsilciTc('');
    setFotoUrl('');
    setEditingId(null);
    alert(
      editingId
        ? 'Kesinti kaydı güncellendi ve yeniden onay havuzuna düştü.'
        : 'Taşeron kesinti kaydı oluşturuldu. Onay Havuzu’nda onaylanınca cari geçmişe işlenir.'
    );
  };

  const handleSil = (id: string) => {
    if (confirm('Bu taşeron kesinti kaydını silmek istediğinize emin misiniz?')) {
      setOperatorFaaliyetleri(prev => prev.filter(f => f.id !== id));
      if (setCariIslemGecmisi) {
        const cid = cariIslemIdForOperatorFaaliyet(id);
        setCariIslemGecmisi((prev) => (prev || []).filter((x) => x.id !== cid && x.islemId !== id));
      }
    }
  };

  const handleDuzenle = (f: OperatorFaaliyet) => {
    setMakineKaynak(f.makineKaynak || (f.operatorTipi === 'KİRALIK' ? 'KIRALIK' : 'DEMIRBAS'));
    setMakineManuelAd(f.makineManuelAd || '');
    setSelectedAracId(f.makineKaynak === 'MANUEL' ? '' : f.aracId);
    setSelectedPersonelId(f.operatorPersonelId || '');
    setOperatorTipi(f.operatorTipi);
    setTarih(f.tarih);
    setBaslangicSaat(f.baslangicSaat);
    setBitisSaat(f.bitisSaat);
    setYapilanIs(f.yapilanIs);
    if (f.firmaId) {
      setFirmaSecim('cari');
      setSelectedCariId(f.firmaId);
    } else {
      setFirmaSecim('manuel');
      setManuelFirma(f.firmaAdi);
    }
    setTemsilciAdSoyad(f.temsilciAdSoyad || '');
    setTemsilciTc(f.temsilciTc || '');
    setFotoUrl(f.fotoUrl || '');
    setEditingId(f.id);
    setActiveSubTab('faaliyet');
  };

  const handleGunRaporla = () => {
    const bugun = new Date().toISOString().split('T')[0];
    const gunluk = operatorFaaliyetleri.filter(f => f.tarih === bugun);
    if (gunluk.length === 0) {
      alert('Bugün için kaydedilmiş faaliyet bulunamadı.');
      return;
    }
    generatePDFReport(gunluk, `Gunluk_Operator_Raporu_${bugun}`);
  };

  const handleAyRaporla = () => {
    const aylik = operatorFaaliyetleri.filter(f => {
      const d = new Date(f.tarih);
      return d.getMonth() + 1 === raporFiltreAy && d.getFullYear() === raporFiltreYil;
    });
    if (aylik.length === 0) {
      alert('Seçilen ay için kaydedilmiş faaliyet bulunamadı.');
      return;
    }
    generatePDFReport(aylik, `Aylik_Operator_Raporu_${raporFiltreAy}_${raporFiltreYil}`);
  };

  const generatePDFReport = (faaliyetler: OperatorFaaliyet[], dosyaAdi: string) => {
    const html = `
      <html>
        <head><meta charset="utf-8"><title>Operatör Raporu</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto;">
          <div style="text-align: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px;">
            ${kibritciLogoHtml(48)}
            <p style="color: #666; margin: 8px 0 5px; font-size: 12px;">İŞ MAKİNESİ OPERATÖR FAALİYET RAPORU</p>
            <p style="color: #999; font-size: 11px;">Oluşturulma: ${new Date().toLocaleString('tr-TR')}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #1e3a5f; color: white;">
                <th style="padding: 10px; border: 1px solid #ddd;">Tarih</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Operatör</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Araç</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Firma</th>
                <th style="padding: 10px; border: 1px solid #ddd;">İş</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Saat</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Süre</th>
              </tr>
            </thead>
            <tbody>
              ${faaliyetler.map(f => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px; border: 1px solid #ddd;">${f.tarih}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${f.operatorIsim}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${f.aracPlaka || f.aracId}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${f.firmaAdi}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${f.yapilanIs}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${f.baslangicSaat}-${f.bitisSaat}</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${f.calismaSuresi.toFixed(1)} sa</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top: 30px; text-align: right; font-size: 12px; color: #666;">
            <p><strong>Toplam Kayıt:</strong> ${faaliyetler.length}</p>
            <p><strong>Toplam Çalışma Saati:</strong> ${faaliyetler.reduce((s, f) => s + f.calismaSuresi, 0).toFixed(1)} saat</p>
          </div>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dosyaAdi}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKesintiRaporuOlustur = () => {
    const aylikFaaliyetler = operatorFaaliyetleri.filter(f => {
      const d = new Date(f.tarih);
      const onayli = f.onayDurumu === 'ONAYLANDI' || f.durum === 'ONAYLANDI';
      return (
        d.getMonth() + 1 === selectedAy &&
        d.getFullYear() === selectedYil &&
        !f.kesintiYansitildi &&
        onayli
      );
    });

    if (aylikFaaliyetler.length === 0) {
      alert('Seçilen ay için onaylanmış ve henüz rapora alınmamış kesinti kaydı bulunamadı.');
      return;
    }

    // Firma + makine kaynağı (Ana Firma / Kiralık) — karışmasın
    const gruplar: { [key: string]: OperatorFaaliyet[] } = {};
    aylikFaaliyetler.forEach((f) => {
      const kaynak = resolveMakineKaynakGrup(f);
      const key = `${f.firmaAdi}||${kaynak}`;
      if (!gruplar[key]) gruplar[key] = [];
      gruplar[key].push(f);
    });

    const yeniRaporlar: TaseronKesintiRaporu[] = [];
    Object.entries(gruplar).forEach(([key, faaliyetler]) => {
      const [firmaAdi, kaynakRaw] = key.split('||');
      const makineKaynakGrup = (kaynakRaw === 'KIRALIK' ? 'KIRALIK' : 'ANA_FIRMA') as
        | 'ANA_FIRMA'
        | 'KIRALIK';
      const toplamSaat = faaliyetler.reduce((s, f) => s + f.calismaSuresi, 0);
      const cari = taseronCariler.find((c) => c.unvan === firmaAdi) || cariKartlar.find((c) => c.unvan === firmaAdi);
      const rapor: TaseronKesintiRaporu = {
        id: `tkr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        kesintiTipi: 'IS_MAKINESI',
        taseronFirmaAdi: firmaAdi,
        taseronFirmaId: cari?.id,
        donemAy: String(selectedAy).padStart(2, '0'),
        donemYil: String(selectedYil),
        toplamSaat: Math.round(toplamSaat * 100) / 100,
        kesintiTutari: 0,
        saatlikUcret: 0,
        ucretOnayBekliyor: true,
        faaliyetler,
        makineKaynakGrup,
        onayDurumu: 'TASLAK',
        olusturanKullanici: currentUser?.email || 'Sistem',
        olusturmaTarihi: new Date().toISOString(),
      };
      yeniRaporlar.push(rapor);
    });

    setTaseronKesintiRaporlari(prev => [...prev, ...yeniRaporlar]);
    
    // Mark activities as reflected
    setOperatorFaaliyetleri(prev => prev.map(f => {
      if (aylikFaaliyetler.some(af => af.id === f.id)) {
        return { ...f, kesintiYansitildi: true };
      }
      return f;
    }));

    // Aylık özet satırını cari geçmişe de yaz (firma kartı eşleşenler)
    if (setCariIslemGecmisi) {
      const ozetIslemler: CariKartIslem[] = yeniRaporlar
        .filter((r) => r.taseronFirmaId)
        .map((r) => ({
          id: `cari_islem_tkr_${r.id}`,
          cariKartId: r.taseronFirmaId!,
          islemTipi: 'OPERATOR_KESINTI' as const,
          islemId: r.id,
          islemBaslik: `İş Makinesi Kesinti · ${makineKaynakGrupLabel(r.makineKaynakGrup || 'ANA_FIRMA')} · ${r.donemAy}/${r.donemYil}`,
          islemDetay: `${r.taseronFirmaAdi} · ${makineKaynakGrupLabel(r.makineKaynakGrup || 'ANA_FIRMA')} · ${r.toplamSaat.toFixed(1)} sa · ${r.faaliyetler.length} kayıt · ücret onayı bekliyor`,
          tarih: `${r.donemYil}-${r.donemAy}-01`,
          belgeNo: r.id,
        }));
      if (ozetIslemler.length) {
        setCariIslemGecmisi((prev) => {
          const ids = new Set(ozetIslemler.map((x) => x.id));
          const rest = (prev || []).filter((x) => !ids.has(x.id));
          return [...ozetIslemler, ...rest];
        });
      }
    }

    if (addNotification) {
      addNotification(`${yeniRaporlar.length} adet iş makinesi kesinti raporu oluşturuldu (${selectedAy}/${selectedYil}) — Ana Firma / Kiralık ayrı.`);
    }
    alert(`${yeniRaporlar.length} adet kesinti raporu oluşturuldu (Ana Firma ve Kiralık ayrı). Yönetici saat ücretini Taşeron Yönetimi’nden girecek.`);
    setShowKesintiModal(false);
  };

  const handleRaporOnayla = (raporId: string) => {
    setTaseronKesintiRaporlari(prev => prev.map(r => 
      r.id === raporId ? { ...r, onayDurumu: 'ONAYLANDI' as const } : r
    ));
  };

  const handleRaporGonder = (rapor: TaseronKesintiRaporu) => {
    const konu = `Kibritçi İnşaat - ${rapor.taseronFirmaAdi} ${rapor.donemAy}/${rapor.donemYil} Kesinti Raporu`;
    const icerik = `Sayın Yetkili,\n\n${rapor.donemAy}/${rapor.donemYil} dönemine ait iş makinesi kesinti raporu:\n\nFirma: ${rapor.taseronFirmaAdi}\nToplam Saat: ${rapor.toplamSaat.toFixed(1)} saat\nSaatlik Ücret: ${rapor.saatlikUcret} TL\nKesinti Tutarı: ${rapor.kesintiTutari.toFixed(2)} TL\n\nFaaliyetler:\n${rapor.faaliyetler.map(f => `- ${f.tarih}: ${f.yapilanIs} (${f.calismaSuresi.toFixed(1)} saat)`).join('\n')}\n\nSaygılarımızla,\nKibritçi İnşaat Taahhüt A.Ş.`;

    void import('../lib/reportEmail').then(({ openReportEmailComposer }) => {
      openReportEmailComposer({
        subject: konu,
        body: icerik,
        fileName: `Kibritci_Kesinti_${rapor.taseronFirmaAdi}_${rapor.donemAy}_${rapor.donemYil}.html`,
      });
    });

    setTaseronKesintiRaporlari(prev => prev.map(r => 
      r.id === rapor.id ? { ...r, onayDurumu: 'GONDERILDI' as const, epostaGonderildi: true, gonderimTarihi: new Date().toISOString() } : r
    ));
  };

  const taseronRaporlari = useMemo(() => {
    return taseronKesintiRaporlari
      .filter(r => !raporFiltreFirma || r.taseronFirmaAdi.toLowerCase().includes(raporFiltreFirma.toLowerCase()))
      .filter(r => r.donemAy === String(raporFiltreAy).padStart(2, '0') && r.donemYil === String(raporFiltreYil))
      .sort((a, b) => new Date(b.olusturmaTarihi).getTime() - new Date(a.olusturmaTarihi).getTime());
  }, [taseronKesintiRaporlari, raporFiltreFirma, raporFiltreAy, raporFiltreYil]);

  return (
    <div className="flex-grow p-3 sm:p-4 lg:p-6 space-y-4 lg:space-y-6 overflow-y-auto h-full font-sans bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">İş Makinesi & Operatör Yönetimi</span>
          <h2 className="text-sm font-black tracking-widest font-display flex items-center gap-2">
            <HardHat size={16} /> OPERATÖR FAALİYET TAKİP SİSTEMİ
          </h2>
          <p className="text-[10px] text-slate-400">Saha faaliyet · yoklama · taşeron kesinti kaydı · ay sonu iş makinesi kesinti raporu.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button onClick={() => setActiveSubTab('saha_faaliyet')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeSubTab === 'saha_faaliyet' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Saha Faaliyet (N/M)</button>
          <button onClick={() => setActiveSubTab('yoklama')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeSubTab === 'yoklama' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Operatör Yoklama</button>
          <button onClick={() => setActiveSubTab('faaliyet')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeSubTab === 'faaliyet' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Taşeron Kesinti</button>
          <button onClick={() => setActiveSubTab('rapor')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeSubTab === 'rapor' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>İş Makinesi Kesinti Raporu</button>
          <button onClick={() => setActiveSubTab('arsiv')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeSubTab === 'arsiv' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Arşiv</button>
        </div>
      </div>

      {activeSubTab === 'saha_faaliyet' && (
        <div className="bg-white border rounded-2xl p-4 sm:p-5 shadow-sm">
          <RolMobilFaaliyetYoklamaPanel
            rol="OPERATOR"
            personeller={personeller}
            cariKartlar={cariKartlar}
            araclar={araclar}
            yoklamalar={yoklamalar}
            setYoklamalar={setYoklamalar}
            saveYoklamalarNow={saveYoklamalarNow}
            currentUser={currentUser}
            addNotification={addNotification}
            showYoklamaTab={false}
            initialSubTab="faaliyet"
          />
        </div>
      )}

      {activeSubTab === 'yoklama' && (
        <div className="bg-white border rounded-2xl p-4 sm:p-5 shadow-sm">
          <KampGunlukYoklamaTab
            personeller={personeller}
            yoklamalar={yoklamalar}
            setYoklamalar={setYoklamalar}
            saveYoklamalarNow={saveYoklamalarNow}
            currentUser={currentUser}
            addNotification={addNotification}
            personelKapsami="operator"
          />
        </div>
      )}

      {/* FAALİYET GİRİŞİ */}
      {activeSubTab === 'faaliyet' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Form */}
          <div className="xl:col-span-1 bg-white border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <Plus size={14} className="text-rose-500" />
              {editingId ? 'Kesinti Kaydı Düzenle' : 'Taşeron Kesinti Kaydı'}
            </h3>
            <p className="text-[10px] text-slate-500 leading-snug">
              Taşeron firmaya çalışıldığında: firma + saat + açıklama + fotoğraf. Kayıt ilgili carinin geçmiş işlemine düşer; ay sonunda maddi kesinti raporuna dönüşür.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Makine Kaynağı</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {(['DEMIRBAS', 'KIRALIK', 'MANUEL'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setMakineKaynak(k)}
                      className={`py-1.5 rounded-lg border text-[9px] font-bold ${makineKaynak === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-200'}`}
                    >
                      {k === 'DEMIRBAS' ? 'Demirbaş' : k === 'KIRALIK' ? 'Kiralık' : 'Elle Giriş'}
                    </button>
                  ))}
                </div>
                {makineKaynak === 'MANUEL' ? (
                  <input
                    type="text"
                    value={makineManuelAd}
                    onChange={(e) => setMakineManuelAd(e.target.value)}
                    placeholder="Makine adı / plaka (elle)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold"
                  />
                ) : (
                  <select
                    value={selectedAracId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedAracId(id);
                      const arac = araclar.find((a) => a.id === id);
                      const mm = `${arac?.markaModel || ''} ${arac?.plaka || ''}`.toLocaleLowerCase('tr-TR');
                      if (mm.includes('jcb')) setOperatorTipi('JCB');
                      else if (mm.includes('kato')) setOperatorTipi('KATO');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500"
                  >
                    <option value="">İş Makinesi Seçiniz</option>
                    {ismakineAraclari.map(a => (
                      <option key={a.id} value={a.id}>{a.plaka} - {a.markaModel}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Operatör (Personel)</label>
                <select value={selectedPersonelId} onChange={e => setSelectedPersonelId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                  <option value="">Operatör seçiniz</option>
                  {operatorPersoneller.length === 0 ? (
                    <option value="" disabled>Personel kartında OPERATÖR görevli kayıt yok</option>
                  ) : (
                    operatorPersoneller.map(p => (
                      <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Makine Etiketi
                </label>
                <p className="text-[9px] text-slate-500 font-semibold mb-1.5 leading-snug">
                  JCB / KATO vb. iş kaydı etiketidir; makine kaynağı (Demirbaş / Kiralık) ile birleşir.
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {(['JCB', 'KATO', 'KİRALIK', 'DİĞER'] as const).map((tip) => (
                    <button
                      key={tip}
                      type="button"
                      onClick={() => setOperatorTipi(tip)}
                      className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold uppercase transition ${
                        operatorTipi === tip
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      {tip}
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2">
                  <p className="text-[8px] font-black uppercase tracking-wider text-amber-700/80 mb-0.5">
                    İş kaydı etiketi
                  </p>
                  <p className="text-[11px] font-extrabold text-amber-950 leading-snug">
                    {canliIsKaydiEtiketi}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tarih</label>
                  <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Başlangıç</label>
                  <input type="time" value={baslangicSaat} onChange={e => setBaslangicSaat(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bitiş</label>
                  <input type="time" value={bitisSaat} onChange={e => setBitisSaat(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500" />
                </div>
              </div>

              {baslangicSaat && bitisSaat && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                  <span className="text-[10px] text-slate-800 font-bold">Hesaplanan Süre: {hesaplaCalismaSuresi(baslangicSaat, bitisSaat).toFixed(1)} saat</span>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Yapılan İş / Açıklama *</label>
                <textarea value={yapilanIs} onChange={e => setYapilanIs(e.target.value)} placeholder="Örn: Parsel B zemin kazma ve hafriyat..." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 resize-none" rows={2} />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Taşeron Firma *</label>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setFirmaSecim('cari')} className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition ${firmaSecim === 'cari' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>Cari Karttan</button>
                  <button type="button" onClick={() => setFirmaSecim('manuel')} className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition ${firmaSecim === 'manuel' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>Elle Gir</button>
                </div>
                {firmaSecim === 'cari' ? (
                  <select value={selectedCariId} onChange={e => setSelectedCariId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                    <option value="">Taşeron Firma Seçin</option>
                    {taseronCariler.length === 0 ? (
                      <option value="" disabled>Cari kartlarda TASERON tipi kayıt yok</option>
                    ) : (
                      taseronCariler.map(c => (
                        <option key={c.id} value={c.id}>{c.unvan} ({c.kod})</option>
                      ))
                    )}
                  </select>
                ) : (
                  <input type="text" value={manuelFirma} onChange={e => setManuelFirma(e.target.value)} placeholder="Firma adı girin..." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Temsilci Ad Soyad</label>
                  <input type="text" value={temsilciAdSoyad} onChange={e => setTemsilciAdSoyad(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Temsilci TC</label>
                  <input type="text" value={temsilciTc} onChange={e => setTemsilciTc(e.target.value.replace(/\D/g, '').slice(0, 11))} maxLength={11} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 font-mono" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Kanıt Fotoğrafı{String(tarih || '') >= KANIT_FOTO_ZORUNLU_BASLANGIC ? ' *' : ' (opsiyonel — Temmuz ve öncesi)'}
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 bg-slate-50 border border-slate-200 border-dashed rounded-xl p-3 text-center cursor-pointer hover:bg-slate-100 transition">
                    <Camera size={16} className="mx-auto text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-500 font-semibold">Fotoğraf Yükle</span>
                    <input type="file" accept="image/*" onChange={handleFotoYukle} className="hidden" />
                  </label>
                  {fotoUrl && (
                    <div className="relative">
                      <img src={fotoUrl} alt="Önizleme" className="w-16 h-16 object-cover rounded-xl border" />
                      <button onClick={() => setFotoUrl('')} className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[8px] flex items-center justify-center">×</button>
                    </div>
                  )}
                </div>
                {String(tarih || '') < KANIT_FOTO_ZORUNLU_BASLANGIC && (
                  <p className="text-[9px] text-amber-700 mt-1 font-semibold">
                    Geçmiş dönem (Temmuz 2026 ve öncesi): fotoğraf olmadan kayıt açılabilir. Ağustos’tan itibaren zorunlu.
                  </p>
                )}
              </div>

              {firmaSecim === 'manuel' && manuelFirma && !cariKartlar.some(c => c.unvan.toLowerCase() === manuelFirma.toLowerCase()) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10px] text-amber-800">
                  <AlertTriangle size={12} className="inline mr-1" />
                  <strong>Bilgi:</strong> "{manuelFirma}" cari kartlarda bulunamadı. Kaydetmek isterseniz Cari Kartlar sekmesinden ekleyebilirsiniz.
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={handleKaydet} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5">
                  <Save size={14} /> {editingId ? 'Güncelle' : 'Kesinti Kaydı Oluştur'}
                </button>
                {editingId && (
                  <button onClick={() => { setEditingId(null); setYapilanIs(''); setFotoUrl(''); }} className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="xl:col-span-2 bg-white border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-3">
              <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <FileText size={14} className="text-amber-500" />
                Taşeron Kesinti Kayıtları
              </h3>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Ara..." className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 w-full sm:w-40" />
                </div>
                <button onClick={handleGunRaporla} className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1">
                  <Printer size={12} /> Gün Raporu
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredFaaliyetler.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <HardHat size={32} className="mx-auto mb-2 opacity-30" />
                  <p>Henüz faaliyet kaydı bulunmuyor.</p>
                </div>
              ) : (
                filteredFaaliyetler.map(f => (
                  <div key={f.id} className="border border-slate-100 rounded-xl p-3 hover:shadow-sm transition bg-slate-50/50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="bg-amber-100 text-amber-900 text-[9px] font-black px-2 py-0.5 rounded-full">
                            {f.isKaydiEtiketi || makineEtiketi(f)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{f.tarih}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            f.onayDurumu === 'ONAYLANDI' || f.durum === 'ONAYLANDI'
                              ? 'bg-emerald-100 text-emerald-700'
                              : f.onayDurumu === 'REDDEDİLDİ' || f.durum === 'REDDEDİLDİ'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-800'
                          }`}>
                            {f.onayDurumu === 'ONAYLANDI' || f.durum === 'ONAYLANDI'
                              ? 'Onaylandı'
                              : f.onayDurumu === 'REDDEDİLDİ' || f.durum === 'REDDEDİLDİ'
                                ? 'Reddedildi'
                                : 'Onay bekliyor'}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${f.kesintiYansitildi ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-800'}`}>
                            {f.kesintiYansitildi ? 'Kesintiye Yansıtıldı' : 'Rapor bekliyor'}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800">{f.yapilanIs}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1"><Truck size={10} /> {f.aracPlaka || f.aracId}</span>
                          <span className="flex items-center gap-1"><HardHat size={10} /> {f.operatorIsim}</span>
                          <span className="flex items-center gap-1"><Building2 size={10} /> {f.firmaAdi}</span>
                          <span className="flex items-center gap-1"><Clock size={10} /> {f.baslangicSaat}-{f.bitisSaat} ({f.calismaSuresi.toFixed(1)} sa)</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleDuzenle(f)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-800 transition" title="Düzenle"><Edit3 size={12} /></button>
                        <button onClick={() => handleSil(f.id)} className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600 transition" title="Sil"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    {f.fotoUrl && (
                      <div className="mt-2">
                        <img src={f.fotoUrl} alt="Faaliyet" className="max-h-32 rounded-lg border object-cover" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* KESİNTİ RAPORLARI */}
      {activeSubTab === 'rapor' && (
        <div className="space-y-6">
          <div className="bg-white border rounded-2xl p-5 shadow-sm flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Ay</label>
              <select value={selectedAy} onChange={e => setSelectedAy(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Yıl</label>
              <select value={selectedYil} onChange={e => setSelectedYil(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-slate-500 w-full">
              Seçilen aydaki taşeron kesinti kayıtları firmaya göre toplanır. Saat ücreti yönetici tarafından <strong>Taşeron Yönetimi</strong> sekmesinde girilir; sonuç maddi kesinti raporudur (firma · saat · açıklama · fotoğraf).
            </p>
            <button onClick={() => setShowKesintiModal(true)} className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-2.5 px-5 rounded-xl transition flex items-center gap-1.5">
              <FileText size={14} /> İş Makinesi Kesinti Raporu Oluştur
            </button>
          </div>

          {showKesintiModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <h3 className="font-display font-black text-slate-800 text-sm">İş Makinesi Kesinti Raporu</h3>
                <p className="text-[11px] text-slate-500">{selectedAy}/{selectedYil} dönemine ait taşeron kesinti kayıtları firmaya göre gruplanıp maddi rapora dönüştürülür.</p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10px] text-amber-800">
                  <p><strong>Dönem:</strong> {String(selectedAy).padStart(2, '0')}/{selectedYil}</p>
                  <p className="mt-1">Rapor Taşeron Yönetimi’ne TASLAK düşer; yönetici saat ücretini onaylayınca kesinti tutarı hesaplanır. İndirilen HTML’de fotoğraflar da yer alır.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleKesintiRaporuOlustur} className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-2.5 rounded-xl transition">Oluştur</button>
                  <button onClick={() => setShowKesintiModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition">İptal</button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider">Oluşturulan Kesinti Raporları</h3>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <input type="text" value={raporFiltreFirma} onChange={e => setRaporFiltreFirma(e.target.value)} placeholder="Firma ara..." className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 w-full sm:w-32" />
                <select value={raporFiltreAy} onChange={e => setRaporFiltreAy(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                  {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
                </select>
                <select value={raporFiltreYil} onChange={e => setRaporFiltreYil(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              {taseronRaporlari.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <FileText size={32} className="mx-auto mb-2 opacity-30" />
                  <p>Henüz kesinti raporu bulunmuyor.</p>
                </div>
              ) : (
                taseronRaporlari.map(rapor => (
                  <div key={rapor.id} className="border border-slate-100 rounded-xl p-4 hover:shadow-sm transition bg-slate-50/50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-slate-100 text-slate-800 text-[9px] font-black px-2 py-0.5 rounded-full">{rapor.taseronFirmaAdi}</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${rapor.makineKaynakGrup === 'KIRALIK' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-900'}`}>
                            {makineKaynakGrupLabel(rapor.makineKaynakGrup || resolveMakineKaynakGrup(rapor.faaliyetler?.[0]))}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{rapor.donemAy}/{rapor.donemYil}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${rapor.ucretOnayBekliyor ? 'bg-amber-100 text-amber-800' : rapor.onayDurumu === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-700' : rapor.onayDurumu === 'GONDERILDI' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-800'}`}>
                            {rapor.ucretOnayBekliyor ? 'ÜCRET BEKLİYOR' : rapor.onayDurumu}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-[10px] text-slate-600 mt-2">
                          <div><span className="text-slate-400">Toplam Saat:</span> <strong className="text-slate-800">{rapor.toplamSaat.toFixed(1)} sa</strong></div>
                          <div><span className="text-slate-400">Saatlik Ücret:</span> <strong className="text-slate-800">{rapor.ucretOnayBekliyor ? 'Yönetici girecek' : `${rapor.saatlikUcret} TL`}</strong></div>
                          <div><span className="text-slate-400">Kesinti:</span> <strong className="text-rose-600">{rapor.ucretOnayBekliyor ? '—' : `${rapor.kesintiTutari.toFixed(2)} TL`}</strong></div>
                        </div>
                        <div className="mt-2 text-[9px] text-slate-400">
                          Faaliyet Sayısı: {rapor.faaliyetler.length} | Oluşturan: {rapor.olusturanKullanici}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {rapor.onayDurumu === 'TASLAK' && (
                          <button onClick={() => handleRaporOnayla(rapor.id)} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 transition" title="Onayla"><CheckCircle size={12} /></button>
                        )}
                        {rapor.onayDurumu === 'ONAYLANDI' && (
                          <button onClick={() => handleRaporGonder(rapor)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-800 transition" title="E-posta Gönder"><Mail size={12} /></button>
                        )}
                        <button onClick={() => (rapor.ucretOnayBekliyor ? alert('Ücret onayı Taşeron sekmesinden yapılır.') : indirIsMakinesiRaporu(rapor))} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition" title="İndir"><Download size={12} /></button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ARŞİV */}
      {activeSubTab === 'arsiv' && (
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-3">
            <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider">Operatör Faaliyet Arşivi</h3>
            <div className="flex gap-2">
              <select value={raporFiltreAy} onChange={e => setRaporFiltreAy(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
              </select>
              <select value={raporFiltreYil} onChange={e => setRaporFiltreYil(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={handleAyRaporla} className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1">
                <Download size={12} /> Ay Raporu İndir
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {operatorFaaliyetleri
              .filter(f => {
                const d = new Date(f.tarih);
                return d.getMonth() + 1 === raporFiltreAy && d.getFullYear() === raporFiltreYil;
              })
              .sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())
              .map(f => (
                <div key={f.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 hover:shadow-sm transition">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="bg-amber-100 text-amber-900 text-[9px] font-black px-2 py-0.5 rounded-full">
                      {f.isKaydiEtiketi || makineEtiketi(f)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{f.tarih}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 mb-1">{f.yapilanIs}</p>
                  <div className="text-[10px] text-slate-500 space-y-0.5">
                    <p><Truck size={10} className="inline mr-1" /> {f.aracPlaka || f.aracId}</p>
                    <p><HardHat size={10} className="inline mr-1" /> {f.operatorIsim}</p>
                    <p><Building2 size={10} className="inline mr-1" /> {f.firmaAdi}</p>
                    <p><Clock size={10} className="inline mr-1" /> {f.baslangicSaat}-{f.bitisSaat} ({f.calismaSuresi.toFixed(1)} sa)</p>
                  </div>
                  {f.fotoUrl && <img src={f.fotoUrl} alt="" className="mt-2 max-h-24 rounded-lg border object-cover" />}
                </div>
              ))}
          </div>
          {operatorFaaliyetleri.filter(f => {
            const d = new Date(f.tarih);
            return d.getMonth() + 1 === raporFiltreAy && d.getFullYear() === raporFiltreYil;
          }).length === 0 && (
            <div className="text-center py-12 text-slate-400 text-xs">
              <FileText size={32} className="mx-auto mb-2 opacity-30" />
              <p>Seçilen ay için arşiv kaydı bulunamadı.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OperatorScreen;
