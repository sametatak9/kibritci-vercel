import React, { useMemo, useState } from 'react';
import { 
  Calendar, Loader2, Mail, Save, Play, Plus, Search, 
  Trash2, CheckCircle2, AlertTriangle, UserCheck, LogOut, Info
} from 'lucide-react';
import { KampKaydi, KampOdasi, Personel } from '../types/erp';
import { 
  archiveHaftalikYoklamaRaporu, 
  emailHaftalikYoklamaRaporu 
} from '../lib/kampHaftalikYoklama';
import { 
  assignKampResident, 
  evictKampResident 
} from '../lib/kampPlacementUtils';
import { submitPersonelCikisTalebi } from '../lib/personelCikisTalebiUtils';

interface KampHaftalikYoklamaTabProps {
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
  personeller: Personel[];
  currentUser?: { email?: string };
  addNotification?: (mesaj: string) => void;
  yoklamalar?: any;
  setYoklamalar?: any;
}

export const KampHaftalikYoklamaTab: React.FC<KampHaftalikYoklamaTabProps> = ({
  kampOdalari,
  kampKayitlari,
  personeller,
  currentUser,
  addNotification,
  yoklamalar,
  setYoklamalar,
}) => {
  const [started, setStarted] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [auditedRooms, setAuditedRooms] = useState<Record<string, boolean>>({});
  const [sessionLogs, setSessionLogs] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');

  // Placement States
  const [placementType, setPlacementType] = useState<'DB' | 'MANUEL'>('DB');
  const [searchPersonelQuery, setSearchPersonelQuery] = useState('');
  const [selectedPersonelId, setSelectedPersonelId] = useState('');
  const [manuelIsim, setManuelIsim] = useState('');
  const [manuelFirma, setManuelFirma] = useState('');

  // Active occupants list mapped by room ID
  const roomOccupantsMap = useMemo(() => {
    const map: Record<string, KampKaydi[]> = {};
    kampKayitlari.forEach((k) => {
      if (k.durum === 'AKTIF') {
        const rId = k.odaId || k.roomId;
        if (rId) {
          if (!map[rId]) map[rId] = [];
          map[rId].push(k);
        }
      }
    });
    return map;
  }, [kampKayitlari]);

  // Set of occupied resident IDs/Names to filter them out of available placement list
  const activeResidentIds = useMemo(() => {
    return new Set(
      kampKayitlari
        .filter((k) => k.durum === 'AKTIF')
        .map((k) => k.personelId)
        .filter(Boolean)
    );
  }, [kampKayitlari]);

  const activeResidentNames = useMemo(() => {
    return new Set(
      kampKayitlari
        .filter((k) => k.durum === 'AKTIF')
        .map((k) => k.personelIsim.toLowerCase().trim())
    );
  }, [kampKayitlari]);

  // Filtered available personnel list for database placement
  const availablePersonel = useMemo(() => {
    return personeller.filter((p) => {
      const statusLower = String(p.durum || '').toLowerCase();
      const isPasif = statusLower === 'pasif' || p.durum === false || statusLower === 'false';
      if (isPasif) return false;

      const pId = p.id;
      const fullName = `${p.ad || ''} ${p.soyad || ''}`.toLowerCase().trim();
      const isPlaced = activeResidentIds.has(pId) || activeResidentNames.has(fullName);
      if (isPlaced) return false;

      const queryStr = searchPersonelQuery.toLowerCase();
      return fullName.includes(queryStr) || (p.gorev || '').toLowerCase().includes(queryStr);
    });
  }, [personeller, activeResidentIds, activeResidentNames, searchPersonelQuery]);

  // Filtered rooms list
  const filteredRooms = useMemo(() => {
    const q = roomSearchQuery.toLowerCase();
    return kampOdalari.filter((room) => {
      const matchText = `${room.yerleskeAdi || ''} ${room.kogusNo || ''} ${room.odaNo || ''}`.toLowerCase();
      return matchText.includes(q);
    });
  }, [kampOdalari, roomSearchQuery]);

  const handleBaslat = () => {
    if (kampOdalari.length === 0) {
      alert('Sistemde kurulu kamp odası bulunamadı. Önce oda kurulumu yapın.');
      return;
    }
    setStarted(true);
    setAuditedRooms({});
    setSessionLogs([]);
    setNotes('');
    setSelectedRoomId(kampOdalari[0]?.id ?? null);
  };

  const handleTahliye = async (reg: KampKaydi) => {
    if (
      !window.confirm(
        `${reg.personelIsim} odadan tahliye edilsin mi?\n\nKamp çıkışı + yönetime işten çıkış talebi gönderilecek.`
      )
    ) {
      return;
    }
    try {
      await evictKampResident(reg, kampOdalari, kampKayitlari);
      try {
        await submitPersonelCikisTalebi({
          personelId: reg.personelId,
          personelIsim: reg.personelIsim,
          cikisTarihi: new Date().toISOString().slice(0, 10),
          cikisNedeni: `Kamp tahliyesi · Oda ${reg.odaNo || ''} — haftalık sayım; işten çıkış onayı bekleniyor.`,
          gonderen: currentUser?.email || 'kampci',
          kaynak: 'KAMPCI_HAFTALIK_TAHLIYE',
        });
      } catch (talebiErr) {
        console.warn('İşten çıkış talebi gönderilemedi:', talebiErr);
      }
      setSessionLogs((prev) => [
        ...prev,
        `${reg.odaNo} nolu odadan ${reg.personelIsim} tahliye edildi · işten çıkış talebi gönderildi.`,
      ]);
      if (addNotification) {
        addNotification(
          `${reg.personelIsim} haftalık sayımda ${reg.odaNo} nolu odadan tahliye edildi · işten çıkış talebi yönetime gönderildi.`
        );
      }
    } catch (err: any) {
      alert('Tahliye edilirken hata oluştu: ' + err.message);
    }
  };

  const handleYerlestir = async () => {
    if (!selectedRoomId) return;
    const targetRoom = kampOdalari.find((r) => r.id === selectedRoomId);
    if (!targetRoom) return;

    let pName = '';
    let pId: string | undefined = undefined;
    let pFirma = '';
    let pFirmaTip: 'ANA_FIRMA' | 'TASERON' = 'TASERON';

    if (placementType === 'DB') {
      const match = personeller.find((p) => p.id === selectedPersonelId);
      if (!match) {
        alert('Lütfen listeden bir personel seçin!');
        return;
      }
      pName = `${match.ad} ${match.soyad}`;
      pId = match.id;
      
      const isTaseron = String(match.firmaAdi || '').toUpperCase().includes('KİBRİTÇİ') === false;
      pFirma = match.firmaAdi || 'KİBRİTÇİ İNŞAAT';
      pFirmaTip = isTaseron ? 'TASERON' : 'ANA_FIRMA';
    } else {
      if (!manuelIsim.trim()) {
        alert('Lütfen isim yazın!');
        return;
      }
      pName = manuelIsim.trim();
      pFirma = manuelFirma.trim() || 'TAŞERON';
      pFirmaTip = 'TASERON';
    }

    try {
      await assignKampResident({
        roomId: selectedRoomId,
        personelIsim: pName,
        personelId: pId,
        calistigiFirma: pFirma,
        firmaTipi: pFirmaTip,
        kampOdalari,
        kampKayitlari,
      });

      setSessionLogs((prev) => [
        ...prev,
        `${targetRoom.odaNo} nolu odaya ${pName} yerleştirildi.`,
      ]);
      
      if (addNotification) {
        addNotification(`${pName} haftalık sayım sırasında ${targetRoom.odaNo} nolu odasına yerleştirildi.`);
      }

      // Reset placement form states
      setManuelIsim('');
      setManuelFirma('');
      setSelectedPersonelId('');
      setSearchPersonelQuery('');
    } catch (err: any) {
      alert('Yerleşim yapılırken hata oluştu: ' + err.message);
    }
  };

  const handleOdayiOnayla = (roomId: string) => {
    setAuditedRooms((prev) => ({ ...prev, [roomId]: true }));
    const room = kampOdalari.find((r) => r.id === roomId);
    if (room) {
      // Find next pending room to auto-select
      const nextPending = kampOdalari.find((r) => r.id !== roomId && !auditedRooms[r.id]);
      if (nextPending) {
        setSelectedRoomId(nextPending.id);
      }
    }
  };

  const handleRaporuKaydet = async () => {
    setSaving(true);
    try {
      const auditedCount = Object.keys(auditedRooms).length;
      if (auditedCount === 0) {
        alert('Lütfen önce en az 1 odanın sayımını tamamlayın!');
        setSaving(false);
        return;
      }

      const hazirlayan = currentUser?.email?.split('@')[0] ?? 'Kampçı';
      
      // Build a detailed weekly camp audit summary text
      const reportLines = [
        'KİBRİTÇİ İNŞAAT — HAFTALIK ODA SAYIM VE KAMP DENETİM RAPORU',
        `Tarih: ${new Date().toLocaleString('tr-TR')}`,
        `Denetleyen: ${hazirlayan} (${currentUser?.email || ''})`,
        `Denetlenen Oda Sayısı: ${auditedCount} / ${kampOdalari.length}`,
        '',
        '--- DENETİM NOTLARI & GÖZLEMLER ---',
        notes.trim() || 'Devir notu veya özel bir gözlem girilmedi.',
        '',
        '--- DENETİM SÜRECİNDE YAPILAN İŞLEMLER ---',
        sessionLogs.length === 0 
          ? 'Oda listeleri günceldi, herhangi bir tahliye veya yeni yerleşim yapılmadı.' 
          : sessionLogs.map((l) => `• ${l}`).join('\n'),
        '',
        '--- ODALARIN GÜNCEL KİŞİ SAYILARI ---',
      ];

      // Add occupancy details
      kampOdalari.forEach((room) => {
        const isAudited = auditedRooms[room.id];
        const occupants = roomOccupantsMap[room.id] || [];
        const status = isAudited ? '[SAYILDI]' : '[BEKLİYOR]';
        const occupantsNames = occupants.map((o) => o.personelIsim).join(', ');
        reportLines.push(
          `• ${room.yerleskeAdi} - Oda ${room.odaNo} (${room.kogusNo}): ${occupants.length} Kişi / ${room.kapasite} Yatak ${status} ${occupants.length > 0 ? `[Sakinler: ${occupantsNames}]` : ''}`
        );
      });

      const rapor = reportLines.join('\n');

      // Archive report in Firestore
      await archiveHaftalikYoklamaRaporu(rapor, hazirlayan);

      // Trigger email
      emailHaftalikYoklamaRaporu(rapor, `Kamp Haftalık Oda Sayımı — ${new Date().toLocaleDateString('tr-TR')}`);

      if (addNotification) {
        addNotification(`Kamp haftalık oda sayımı tamamlandı ve arşivlendi (${auditedCount} oda denetlendi).`);
      }

      alert('Haftalık oda sayımı başarıyla tamamlandı, rapor arşivlendi ve e-posta penceresi açıldı!');
      
      // Reset session
      setStarted(false);
      setAuditedRooms({});
      setSelectedRoomId(null);
      setSessionLogs([]);
      setNotes('');
    } catch (err: any) {
      console.error(err);
      alert('Rapor kaydedilemedi: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!started) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-sm">
        <Calendar size={40} className="mx-auto text-slate-700" />
        <h3 className="font-bold text-slate-800">Kamp Haftalık Oda Sayımı &amp; Denetim</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Bu işlem, odalarda kalan fiili personel listelerini kontrol etmek, çıkanları tahliye etmek 
          ve yeni girenlerin kaydını güncellemek amacıyla yapılan haftalık mutabakat denetimidir.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs font-semibold text-slate-600 space-y-1 leading-relaxed">
          <div className="flex items-center space-x-1 text-slate-800 font-bold mb-1">
            <Info size={14} className="text-amber-500" />
            <span>Sayım Süreci Nasıl İlerler?</span>
          </div>
          <div>1. Sayımı Başlat butonuna tıklayarak denetim oturumunu açın.</div>
          <div>2. Odaları tek tek inceleyerek odada kalan fiili kişilerle sistemdekileri eşleştirin.</div>
          <div>3. Odadan ayrılan personelleri <strong>Tahliye Edin</strong>, yeni girenleri <strong>Odaya Yerleştirin</strong>.</div>
          <div>4. Sayımı tamamlanan odayı onaylayın ve en son Raporu Kaydedip yönetime gönderin.</div>
        </div>
        <button
          type="button"
          onClick={handleBaslat}
          className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs px-6 py-3 rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-sm transition"
        >
          <Play size={14} />
          Haftalık Oda Sayımını Başlat
        </button>
      </div>
    );
  }

  const selectedRoom = kampOdalari.find((r) => r.id === selectedRoomId);
  const selectedOccupants = selectedRoomId ? (roomOccupantsMap[selectedRoomId] || []) : [];
  const auditedCount = Object.keys(auditedRooms).length;

  return (
    <div className="space-y-4">
      {/* Session Progress Header */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between bg-slate-900 text-white p-4.5 rounded-3xl border border-slate-800 shadow-md">
        <div className="space-y-1">
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">Kamp Mutabakat Oturumu Aktif</span>
          <h2 className="text-sm font-black tracking-wider uppercase">Kamp Haftalık Oda Sayımı ve Denetimi</h2>
          <p className="text-[10px] text-slate-400">Tüm odalardaki fiili personel listelerini kontrol edin, tahliye veya yerleşimleri yapıp raporlayın.</p>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <div className="text-right">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">Sayım Durumu</span>
            <span className="text-xs font-mono font-bold text-emerald-400">{auditedCount} / {kampOdalari.length} Oda Tamamlandı</span>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleRaporuKaydet}
            className="bg-emerald-650 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black px-4.5 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow shadow-emerald-500/10 transition"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
            Sayımı Bitir &amp; Raporla
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Panel: Rooms list */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col max-h-[600px]">
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Odalar ({filteredRooms.length})</h3>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Search size={13} />
              </span>
              <input
                type="text"
                placeholder="Yerleşke veya oda ara..."
                value={roomSearchQuery}
                onChange={(e) => setRoomSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs placeholder-slate-400 focus:outline-none focus:border-amber-500 text-slate-800 font-semibold"
              />
            </div>
          </div>

          <div className="flex-grow p-2.5 space-y-1.5 overflow-y-auto">
            {filteredRooms.map((room) => {
              const isSelected = room.id === selectedRoomId;
              const isAudited = auditedRooms[room.id];
              const occupants = roomOccupantsMap[room.id] || [];

              return (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-slate-900 text-white shadow'
                      : 'bg-white hover:bg-slate-50 border-slate-200/60 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <span className={`text-[9px] font-mono block ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                      {room.yerleskeAdi}
                    </span>
                    <span className="text-xs font-extrabold block mt-0.5 truncate">
                      {room.kogusNo} · Oda {room.odaNo}
                    </span>
                    <span className={`text-[9px] font-semibold mt-1 block ${occupants.length >= room.kapasite ? 'text-red-500' : 'text-slate-400'}`}>
                      {occupants.length} / {room.kapasite} Sakin
                    </span>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isAudited ? (
                      <span className="text-emerald-500 flex items-center justify-center" title="Sayım yapıldı">
                        <CheckCircle2 size={16} className="stroke-[2.5]" />
                      </span>
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-300 block" title="Sayım bekliyor" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Selected room details & placement tool */}
        <div className="lg:col-span-8 space-y-5">
          {selectedRoom ? (
            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-5 space-y-6">
              
              {/* Room Header Info */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Denetlenen Oda:</span>
                  <h3 className="text-base font-black text-slate-800">
                    {selectedRoom.yerleskeAdi} — {selectedRoom.kogusNo} / Oda {selectedRoom.odaNo}
                  </h3>
                  <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                    Kapasite: {selectedRoom.kapasite} Yatak · Mevcut Sakin: {selectedOccupants.length} Kişi
                  </span>
                </div>
                
                {!auditedRooms[selectedRoom.id] ? (
                  <button
                    type="button"
                    onClick={() => handleOdayiOnayla(selectedRoom.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 px-4 rounded-xl shadow shadow-emerald-500/10 transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <CheckCircle2 size={14} />
                    <span>Odayı Doğrula &amp; Sayımı Onayla</span>
                  </button>
                ) : (
                  <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs py-1.5 px-3.5 rounded-xl flex items-center space-x-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    <span>Sayım Doğrulandı</span>
                  </span>
                )}
              </div>

              {/* Occupants List section */}
              <div className="space-y-3">
                <span className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">Odadaki Mevcut Sakinler ({selectedOccupants.length})</span>
                
                {selectedOccupants.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs italic">
                    Odada konaklayan kimse kayıtlı görünmüyor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedOccupants.map((occ) => (
                      <div key={occ.id} className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex justify-between items-center hover:border-slate-300 transition">
                        <div>
                          <span className="text-xs font-black text-slate-800 block">{occ.personelIsim}</span>
                          <span className="text-[9px] text-slate-500 font-bold block mt-0.5 uppercase tracking-wide">
                            {occ.calistigiFirma || 'Belirtilmedi'}
                          </span>
                          <span className="text-[9px] text-slate-400 block mt-1">
                            Giriş Tarihi: {occ.girisTarihi || '—'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTahliye(occ)}
                          className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-700 font-extrabold text-[9px] p-2 rounded-xl transition flex items-center space-x-1 cursor-pointer"
                          title="Odadan Tahliye Et (Check-out)"
                        >
                          <LogOut size={11} />
                          <span>Tahliye Et</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Placement tool section */}
              {selectedOccupants.length < selectedRoom.kapasite && (
                <div className="pt-5 border-t border-slate-100 space-y-4">
                  <span className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">Odaya Yeni Sakin Yerleştir / Transfer Et</span>
                  
                  {/* Select placement mode */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200 w-full max-w-xs">
                    <button
                      type="button"
                      onClick={() => setPlacementType('DB')}
                      className={`py-1.5 rounded-lg text-[10px] font-black text-center transition ${
                        placementType === 'DB' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Kayıtlı Personel
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlacementType('MANUEL')}
                      className={`py-1.5 rounded-lg text-[10px] font-black text-center transition ${
                        placementType === 'MANUEL' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Manuel Giriş (Taşeron/Misafir)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
                    {placementType === 'DB' ? (
                      <>
                        <div className="md:col-span-4 space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">Personel Ara</label>
                          <input
                            type="text"
                            placeholder="İsim veya görev yaz..."
                            value={searchPersonelQuery}
                            onChange={(e) => setSearchPersonelQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="md:col-span-5 space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">Personel Seçin ({availablePersonel.length})</label>
                          <select
                            value={selectedPersonelId}
                            onChange={(e) => setSelectedPersonelId(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-amber-500"
                          >
                            <option value="">-- Personel Seçin --</option>
                            {availablePersonel.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.ad} {p.soyad} ({p.firmaAdi || 'Kibritçi'}) — {p.gorev || 'Düz İşçi'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="md:col-span-5 space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">Adı Soyadı</label>
                          <input
                            type="text"
                            placeholder="Personel ad soyad..."
                            value={manuelIsim}
                            onChange={(e) => setManuelIsim(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="md:col-span-4 space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">Çalıştığı Firma</label>
                          <input
                            type="text"
                            placeholder="Firma ünvanı..."
                            value={manuelFirma}
                            onChange={(e) => setManuelFirma(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </>
                    )}

                    <div className="md:col-span-3">
                      <button
                        type="button"
                        onClick={handleYerlestir}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl transition flex items-center justify-center space-x-1 cursor-pointer shadow-sm"
                      >
                        <Plus size={14} />
                        <span>Odaya Yerleştir</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-center text-slate-400 text-xs italic">
              Lütfen sol taraftaki listeden denetlemek istediğiniz odayı seçin.
            </div>
          )}

          {/* Audit Notes & Session Logs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Audit Notes Textarea */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4.5 space-y-2.5 shadow-sm">
              <span className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">Genel Denetim Notları &amp; Gözlemler</span>
              <textarea
                rows={3}
                placeholder="Örn: A Blok koguş genel temizliği yapıldı. 104 nolu odada kırık yatak tespit edildi."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>

            {/* Session Audit Logs */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4.5 space-y-2.5 shadow-sm flex flex-col max-h-[170px]">
              <span className="text-[10px] font-black text-slate-500 block uppercase tracking-wider shrink-0">Bu Sayımda Yapılan İşlemler ({sessionLogs.length})</span>
              <div className="flex-grow overflow-y-auto space-y-1.5 pr-1">
                {sessionLogs.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Henüz işlem yapılmadı.</p>
                ) : (
                  sessionLogs.map((log, idx) => (
                    <div key={idx} className="text-[10px] text-slate-650 bg-slate-50 border border-slate-100 p-1.5 rounded-lg flex items-start space-x-1 leading-relaxed">
                      <span className="text-emerald-500 font-bold shrink-0">✓</span>
                      <span>{log}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default KampHaftalikYoklamaTab;
