import { CariKart, CariKartIslem, KampKaydi, KampOdasi, OperatorFaaliyet, Personel, TaseronEnerjiKaydi, TaseronKesintiRaporu, TaseronSayacOlcum, TaseronYemekKaydi } from '../types/erp';
import { AKVIZYON_GOREV, isAkvizyonFirmaAdi } from './guvenlikHelpers';
import { isTaseronPersonel } from './yoklamaUtils';

/** Taşeron saha personeli standart görev adı */
export const TASERON_PERSONEL_GOREV = 'TAŞERON PERSONEL';

/** Taşeron personel departmanı — tek etiket: ŞANTİYE (firmaTipi ayrı kalır) */
export const TASERON_PERSONEL_DEPARTMAN = 'ŞANTİYE';

export function resolveTaseronPersonelGorev(opts: {
  firmaAdi?: string | null;
  firmaTipi?: Personel['firmaTipi'] | string;
}): string {
  if (isAkvizyonFirmaAdi(opts.firmaAdi)) return AKVIZYON_GOREV;
  return TASERON_PERSONEL_GOREV;
}

export function isTaseronPersonelRecord(p: Pick<Personel, 'firmaTipi' | 'firmaAdi'>): boolean {
  return p.firmaTipi === 'TASERON' || isTaseronPersonel(p as Personel);
}

/** Taşeron kayıtlarında görev otomatik TAŞERON PERSONEL (Akvizyon → GÜVENLİK). */
export function withTaseronPersonelGorev<T extends Personel>(p: T): T {
  if (!isTaseronPersonelRecord(p)) return p;
  const gorev = resolveTaseronPersonelGorev({ firmaAdi: p.firmaAdi, firmaTipi: p.firmaTipi });
  const departman =
    p.departman === 'TAŞERON' || !p.departman ? TASERON_PERSONEL_DEPARTMAN : p.departman;
  if (p.gorev === gorev && p.firmaTipi === 'TASERON' && departman === p.departman) {
    return p;
  }
  return {
    ...p,
    firmaTipi: 'TASERON',
    gorev,
    departman,
  };
}

export function getTaseronCariKartlar(cariKartlar: CariKart[]): CariKart[] {
  return cariKartlar.filter(
    (c) =>
      (c.kartTipi === 'TASERON' || String((c as { tur?: string }).tur || '').toUpperCase() === 'TASERON') &&
      c.durum !== 'PASIF'
  );
}

export function normFirma(s: string): string {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

/** Türkçe karakter + Ltd/Limited/Şirketi varyasyonlarını sadeleştir */
export function firmaAnahtar(s: string): string {
  return normFirma(s)
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\b(limited|ltd\.?|şti\.?|sti\.?|a\.?\s*ş\.?|as\.?|san\.?|tic\.?|ve|insaat|inşaat|sirketi|sirket)\b/gi, ' ')
    .replace(/[.,/\\\-_'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alias — mevcut çağrılar (taseronMevcudiyetUtils vb.) */
export function foldFirma(s: string): string {
  return firmaAnahtar(s);
}

export function firmaEslesir(a: string, b: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  if (normFirma(a) === normFirma(b)) return true;
  const ka = firmaAnahtar(a);
  const kb = firmaAnahtar(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Birinin diğeri içinde geçmesi (Demirkaan / Demirkaan İnşaat)
  if (ka.length >= 4 && kb.length >= 4 && (ka.includes(kb) || kb.includes(ka))) return true;
  return false;
}

export type TaseronFirmaEnvanterSatir = {
  key: string;
  unvan: string;
  cari?: CariKart;
  personelSayisi: number;
  kampSakinSayisi: number;
  durum: 'AKTIF' | 'PASIF' | 'ORPHAN';
  personeller: Personel[];
};

/** Cari + personel firmaAdi + kamp calistigiFirma birleşik taşeron envanteri */
export function buildTaseronFirmaEnvanteri(
  cariKartlar: CariKart[],
  personeller: Personel[],
  kampKayitlari: KampKaydi[] = []
): TaseronFirmaEnvanterSatir[] {
  const cariler = getTaseronCariKartlar(cariKartlar);
  const byKey = new Map<string, TaseronFirmaEnvanterSatir>();

  const ensure = (rawName: string, cari?: CariKart) => {
    const name = (cari?.unvan || rawName || '').trim();
    if (!name) return null;
    const key = firmaAnahtar(name) || normFirma(name);
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        unvan: name,
        cari,
        personelSayisi: 0,
        kampSakinSayisi: 0,
        durum: cari ? (cari.durum === 'PASIF' ? 'PASIF' : 'AKTIF') : 'ORPHAN',
        personeller: [],
      };
      byKey.set(key, row);
    } else if (cari && !row.cari) {
      row.cari = cari;
      row.unvan = cari.unvan;
      row.durum = cari.durum === 'PASIF' ? 'PASIF' : 'AKTIF';
    }
    return row;
  };

  for (const c of cariler) ensure(c.unvan, c);

  for (const p of personeller) {
    const firma = (p.firmaAdi || '').trim();
    if (!firma) continue;
    if (p.firmaTipi === 'ANA_FIRMA') continue;
    // Taşeron veya firma adı cari taşeronlarla eşleşenler
    const matchedCari = cariler.find((c) => firmaEslesir(firma, c.unvan));
    if (p.firmaTipi !== 'TASERON' && !matchedCari) continue;
    const row = ensure(matchedCari?.unvan || firma, matchedCari);
    if (!row) continue;
    if (!row.personeller.some((x) => x.id === p.id)) {
      row.personeller.push(p);
      row.personelSayisi = row.personeller.length;
    }
  }

  for (const k of kampKayitlari) {
    if (k.durum !== 'AKTIF') continue;
    const firma = (k.calistigiFirma || '').trim();
    if (!firma) continue;
    const matchedCari = cariler.find((c) => firmaEslesir(firma, c.unvan));
    if (!matchedCari) {
      const hasTaseronPersonel = personeller.some(
        (p) => p.firmaTipi === 'TASERON' && firmaEslesir(p.firmaAdi || '', firma)
      );
      if (!hasTaseronPersonel) continue;
    }
    const row = ensure(matchedCari?.unvan || firma, matchedCari);
    if (row) row.kampSakinSayisi += 1;
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.unvan.localeCompare(b.unvan, 'tr', { sensitivity: 'base' })
  );
}

export function taseronEnvanterOzet(rows: TaseronFirmaEnvanterSatir[]) {
  return {
    toplamFirma: rows.length,
    cariVar: rows.filter((r) => r.cari).length,
    carisiz: rows.filter((r) => !r.cari).length,
    personelsizCari: rows.filter((r) => r.cari && r.personelSayisi === 0).length,
    toplamPersonel: rows.reduce((s, r) => s + r.personelSayisi, 0),
  };
}

export function faaliyetlerForTaseron(
  faaliyetler: OperatorFaaliyet[],
  taseron: CariKart,
  ay?: number,
  yil?: number
): OperatorFaaliyet[] {
  return faaliyetler.filter((f) => {
    const firmaOk =
      (f.firmaId && f.firmaId === taseron.id) ||
      firmaEslesir(f.firmaAdi, taseron.unvan);
    if (!firmaOk) return false;
    if (ay != null && yil != null) {
      const d = new Date(f.tarih);
      return d.getMonth() + 1 === ay && d.getFullYear() === yil;
    }
    return true;
  });
}

export function sayacFarki(o: TaseronSayacOlcum): number {
  return Math.max(0, (o.sonOkuma || 0) - (o.ilkOkuma || 0));
}

export function sayacTutari(o: TaseronSayacOlcum): number {
  return Math.round(sayacFarki(o) * (o.birimFiyat || 0) * 100) / 100;
}

export type EnerjiKalem = 'ELEKTRIK' | 'SU' | 'DOGALGAZ';

/** Dahil edilen kalemlerin tutar toplamı (aktifKalemler yoksa fark>0 olanlar) */
export function enerjiAktifKalemler(
  kayit: Pick<TaseronEnerjiKaydi, 'elektrik' | 'su' | 'dogalgaz' | 'aktifKalemler'>
): EnerjiKalem[] {
  if (kayit.aktifKalemler && kayit.aktifKalemler.length > 0) {
    return kayit.aktifKalemler;
  }
  const out: EnerjiKalem[] = [];
  if (sayacFarki(kayit.elektrik) > 0) out.push('ELEKTRIK');
  if (sayacFarki(kayit.su) > 0) out.push('SU');
  if (sayacFarki(kayit.dogalgaz) > 0) out.push('DOGALGAZ');
  return out;
}

export function enerjiToplamTutar(
  kayit: Pick<TaseronEnerjiKaydi, 'elektrik' | 'su' | 'dogalgaz' | 'aktifKalemler'>
): number {
  const aktif = new Set(enerjiAktifKalemler(kayit));
  // Eski kayıtlar: aktif boşsa tüm kalemleri topla (geriye uyum)
  if (aktif.size === 0 && !kayit.aktifKalemler) {
    return sayacTutari(kayit.elektrik) + sayacTutari(kayit.su) + sayacTutari(kayit.dogalgaz);
  }
  let t = 0;
  if (aktif.has('ELEKTRIK')) t += sayacTutari(kayit.elektrik);
  if (aktif.has('SU')) t += sayacTutari(kayit.su);
  if (aktif.has('DOGALGAZ')) t += sayacTutari(kayit.dogalgaz);
  return t;
}

export function enerjiKalemOzet(
  kayit: Pick<TaseronEnerjiKaydi, 'elektrik' | 'su' | 'dogalgaz' | 'aktifKalemler'>
): string {
  const aktif = enerjiAktifKalemler(kayit);
  if (aktif.length === 0) return 'Kesinti kalemi yok';
  return aktif
    .map((k) => {
      if (k === 'ELEKTRIK') return `Elektrik ${sayacFarki(kayit.elektrik)} kWh`;
      if (k === 'SU') return `Su ${sayacFarki(kayit.su)} m³`;
      return `Doğalgaz ${sayacFarki(kayit.dogalgaz)} m³`;
    })
    .join(' · ');
}

export function oncekiDonem(ay: number, yil: number): { ay: number; yil: number } {
  if (ay <= 1) return { ay: 12, yil: yil - 1 };
  return { ay: ay - 1, yil };
}

export function donemKey(ay: number, yil: number): string {
  return `${String(ay).padStart(2, '0')}-${yil}`;
}

export function ayAdi(ay: number): string {
  const names = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ];
  return names[ay - 1] || String(ay);
}

/** Önceki ayın son okuması → bu ayın ilk okuması */
export function ilkOkumaFromOncekiAy(
  kayitlar: TaseronEnerjiKaydi[],
  taseronId: string,
  ay: number,
  yil: number
): { elektrik: number; su: number; dogalgaz: number } {
  const prev = oncekiDonem(ay, yil);
  const onceki = kayitlar.find(
    (k) =>
      k.taseronCariId === taseronId &&
      k.donemAy === String(prev.ay).padStart(2, '0') &&
      k.donemYil === String(prev.yil)
  );
  if (!onceki) {
    return { elektrik: 0, su: 0, dogalgaz: 0 };
  }
  return {
    elektrik: onceki.elektrik.sonOkuma,
    su: onceki.su.sonOkuma,
    dogalgaz: onceki.dogalgaz.sonOkuma,
  };
}

export function yemekAylikOzet(
  kayitlar: TaseronYemekKaydi[],
  taseronId: string,
  ay: number,
  yil: number
): { sabah: number; ogle: number; aksam: number; gunSayisi: number } {
  const filtered = kayitlar.filter((k) => {
    if (k.taseronCariId !== taseronId) return false;
    const d = new Date(k.tarih);
    return d.getMonth() + 1 === ay && d.getFullYear() === yil;
  });
  return {
    sabah: filtered.reduce((s, k) => s + k.sabah, 0),
    ogle: filtered.reduce((s, k) => s + k.ogle, 0),
    aksam: filtered.reduce((s, k) => s + k.aksam, 0),
    gunSayisi: filtered.length,
  };
}

export function makineKaynakLabel(kaynak?: OperatorFaaliyet['makineKaynak'] | null): string {
  if (kaynak === 'KIRALIK') return 'Kiralık';
  if (kaynak === 'MANUEL') return 'Elle';
  return 'Demirbaş';
}

/** İcmal / kesinti ayrımı: Ana Firma makinesi vs Kiralık (karışmaz) */
export type MakineKaynakGrup = 'ANA_FIRMA' | 'KIRALIK';

export function resolveMakineKaynakGrup(
  f: Pick<OperatorFaaliyet, 'makineKaynak' | 'operatorTipi'> | null | undefined
): MakineKaynakGrup {
  if (!f) return 'ANA_FIRMA';
  if (f.makineKaynak === 'KIRALIK') return 'KIRALIK';
  if (f.makineKaynak === 'DEMIRBAS' || f.makineKaynak === 'MANUEL') return 'ANA_FIRMA';
  const tip = String(f.operatorTipi || '').toLocaleUpperCase('tr-TR');
  if (tip === 'KİRALIK' || tip === 'KIRALIK') return 'KIRALIK';
  return 'ANA_FIRMA';
}

export function makineKaynakGrupLabel(g: MakineKaynakGrup): string {
  return g === 'KIRALIK' ? 'Kiralık Makine' : 'Ana Firma Makinesi';
}

/** Demirbaş envanterindeki iş makinelerini operatör seçim listesine almak için */
export function isIsMakinesiArac(a: {
  aracTipi?: string | null;
  tur?: string | null;
  markaModel?: string | null;
  plaka?: string | null;
  durum?: string | null;
}): boolean {
  if (String(a.durum || '').toLocaleUpperCase('tr-TR') === 'PASIF') return false;

  // IdariScreen kaydı: aracTipi = 'IS_MAKINESI' (eski filtre yanlışlıkla tur === 'İŞ MAKİNESİ' arıyordu)
  const tip = String(a.aracTipi || a.tur || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[\s-]+/g, '_');
  if (tip === 'IS_MAKINESI' || tip.includes('IS_MAKINE')) return true;

  const blob = `${a.markaModel || ''} ${a.plaka || ''}`.toLocaleLowerCase('tr-TR');
  return (
    blob.includes('jcb') ||
    blob.includes('kato') ||
    blob.includes('excavator') ||
    blob.includes('ekskavat') ||
    blob.includes('iş makinesi') ||
    blob.includes('is makinesi') ||
    blob.includes('dozer') ||
    blob.includes('loder') ||
    blob.includes('loader') ||
    blob.includes('exc') ||
    blob.includes('eks')
  );
}

/**
 * İş kaydı etiketi — örn. "Demirbaş JCB makinesi iş kaydı"
 * Makine kaynağı (Demirbaş/Kiralık/Elle) + makine tipi etiketi (JCB/KATO/…) birleşir.
 */
export function buildOperatorIsKaydiEtiketi(opts: {
  makineKaynak?: OperatorFaaliyet['makineKaynak'] | null;
  operatorTipi?: OperatorFaaliyet['operatorTipi'] | string | null;
  makineManuelAd?: string | null;
  aracPlaka?: string | null;
}): string {
  const kaynak = makineKaynakLabel(opts.makineKaynak);
  const tipRaw = String(opts.operatorTipi || 'DİĞER').trim().toLocaleUpperCase('tr-TR') || 'DİĞER';
  // Kaynak zaten kiralıkken tip "KİRALIK" tekrarını kısalt
  const tip =
    opts.makineKaynak === 'KIRALIK' && tipRaw === 'KİRALIK' ? 'makine' : tipRaw === 'KİRALIK' ? 'Kiralık' : tipRaw;

  const plaka = String(opts.aracPlaka || opts.makineManuelAd || '').trim();
  const base =
    tip === 'makine'
      ? `${kaynak} makinesi iş kaydı`
      : `${kaynak} ${tip} makinesi iş kaydı`;
  return plaka ? `${base} · ${plaka}` : base;
}

export function makineEtiketi(f: OperatorFaaliyet): string {
  return buildOperatorIsKaydiEtiketi({
    makineKaynak: f.makineKaynak,
    operatorTipi: f.operatorTipi,
    makineManuelAd: f.makineManuelAd,
    aracPlaka: f.aracPlaka,
  });
}

export function cariIslemIdForOperatorFaaliyet(faaliyetId: string): string {
  return `cari_islem_of_${faaliyetId}`;
}

/** Onaylanmış iş makinesi kesintisini cari geçmiş kaydına çevirir */
export function buildCariIslemFromOperatorFaaliyet(f: OperatorFaaliyet): CariKartIslem | null {
  if (!f.firmaId) return null;
  return {
    id: cariIslemIdForOperatorFaaliyet(f.id),
    cariKartId: f.firmaId,
    islemTipi: 'OPERATOR_KESINTI',
    islemId: f.id,
    islemBaslik: `İş Makinesi Kesinti · ${f.firmaAdi}`,
    islemDetay: `${f.tarih} · ${f.operatorIsim} · ${makineEtiketi(f)} · ${f.baslangicSaat}–${f.bitisSaat} (${f.calismaSuresi.toFixed(1)} sa) · ${f.yapilanIs}`,
    tarih: f.tarih,
    belgeNo: f.id,
    fotoUrl: f.fotoUrl,
  };
}

export function cariIslemIdForMakineKesintiRaporu(raporId: string): string {
  return `cari_islem_tkr_${raporId}`;
}

/** Dönemlik iş makinesi kesinti raporunu taşeron cari geçmişine çevirir */
export function buildCariIslemFromMakineKesintiRaporu(
  rapor: TaseronKesintiRaporu
): CariKartIslem | null {
  const cariId = rapor.taseronFirmaId;
  if (!cariId) return null;
  const ay = Number(rapor.donemAy);
  const yil = Number(rapor.donemYil);
  const tarih = `${rapor.donemYil}-${String(rapor.donemAy).padStart(2, '0')}-01`;
  return {
    id: cariIslemIdForMakineKesintiRaporu(rapor.id),
    cariKartId: cariId,
    islemTipi: 'OPERATOR_KESINTI',
    islemId: rapor.id,
    islemBaslik: `İş Makinesi Kesinti · ${rapor.taseronFirmaAdi}`,
    islemDetay: `${ayAdi(ay)} ${yil} · ${rapor.toplamSaat.toFixed(1)} sa × ${Number(rapor.saatlikUcret || 0).toLocaleString('tr-TR')} TL/sa = ${Number(rapor.kesintiTutari || 0).toLocaleString('tr-TR')} TL · ${rapor.faaliyetler?.length || 0} faaliyet`,
    tutar: rapor.kesintiTutari,
    tarih,
    belgeNo: rapor.id,
  };
}

export function hesaplaKesintiTutari(toplamSaat: number, saatlikUcret: number): number {
  return Math.round(toplamSaat * saatlikUcret * 100) / 100;
}

function normalizePersonelName(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

export function personelForTaseron(personeller: Personel[], taseron: CariKart): Personel[] {
  const unvan = taseron?.unvan || '';
  return personeller
    .filter((p) => {
      const firmaAdi = String(p.firmaAdi || '').trim();
      if (!firmaAdi || !unvan) return false;
      // Firma adı cari unvan ile eşleşiyorsa göster (firmaTipi yanlış olsa bile)
      return firmaEslesir(firmaAdi, unvan);
    })
    .sort((a, b) =>
      `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' })
    );
}

/** Herhangi bir cari kart için bağlı personeller (taşeron / tedarikçi adı eşleşmesi) */
export function personelForCariKart(personeller: Personel[], cari: CariKart): Personel[] {
  return personelForTaseron(personeller, cari);
}

export function formatPersonelKampYerlesim(
  personel: Personel,
  kampKayitlari: KampKaydi[],
  kampOdalari: KampOdasi[]
): string {
  const fullName = `${personel.ad} ${personel.soyad}`.trim();
  const activeStay = kampKayitlari.find(
    (k) =>
      k.durum === 'AKTIF' &&
      ((personel.id && k.personelId === personel.id) ||
        normalizePersonelName(k.personelIsim || '') === normalizePersonelName(fullName))
  );
  if (!activeStay) return '— Kamp ataması yok';

  const room = kampOdalari.find(
    (r) => r.id === activeStay.odaId || r.id === activeStay.roomId
  );
  const yerleske = room?.yerleskeAdi || activeStay.yerleskeAdi || 'Yerleşke';
  const kat = room?.kogusNo || activeStay.katAdi || 'Kat';
  const oda = room?.odaNo || activeStay.odaNo || '?';
  return `${yerleske} · ${kat} · Oda ${oda}`;
}
