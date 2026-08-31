import { normalizeDateKey } from './dateKeyUtils';
import { SahaFaaliyeti, SahaKolajFoto } from '../types/erp';

export interface ParselBlokAnalizRow {
  id: string;
  tarih: string;
  kaynak: string;
  isNiteligi: string;
  parsel: string;
  blok: string;
  aciklama: string;
  ustaSayisi: number;
  isciSayisi: number;
  personelAdet: number;
  fotoVar: boolean;
}

export interface ParselBlokAnalizOzet {
  toplamFaaliyet: number;
  formenKayit: number;
  idariKayit: number;
  kolajFoto: number;
  toplamUsta: number;
  toplamIsci: number;
  toplamPersonelAtama: number;
  rows: ParselBlokAnalizRow[];
}

export function buildParselBlokAnaliz(input: {
  sahaFaaliyetleri: SahaFaaliyeti[];
  kolajFotolari?: SahaKolajFoto[];
  parsel?: string;
  blok?: string;
  baslangicTarih?: string;
  bitisTarih?: string;
}): ParselBlokAnalizOzet {
  const { sahaFaaliyetleri, kolajFotolari = [], parsel, blok, baslangicTarih, bitisTarih } = input;

  const inDateRange = (tarihRaw: string) => {
    const key = normalizeDateKey(tarihRaw);
    if (!key) return false;
    if (baslangicTarih && key < baslangicTarih) return false;
    if (bitisTarih && key > bitisTarih) return false;
    return true;
  };

  const matchesLocation = (p: string, b: string) => {
    if (parsel && parsel !== 'TUMU' && p !== parsel) return false;
    if (blok && blok !== 'TUMU' && b !== blok) return false;
    return true;
  };

  const faaliyetRows: ParselBlokAnalizRow[] = sahaFaaliyetleri
    .filter((sf) => inDateRange(sf.tarih) && matchesLocation(sf.parsel || '', sf.blok || ''))
    .map((sf) => ({
      id: sf.id,
      tarih: normalizeDateKey(sf.tarih),
      kaynak: sf.kaynakEkran === 'FORMEN_MOBIL' ? 'Formen Mobil' : sf.kaynakEkran === 'IDARI_SAHA' ? 'İdari Saha' : String(sf.kaynakEkran || 'Diğer'),
      isNiteligi: sf.isNiteligi,
      parsel: sf.parsel,
      blok: sf.blok,
      aciklama: sf.aciklama,
      ustaSayisi: sf.ustaSayisi ?? 0,
      isciSayisi: sf.isciSayisi ?? 0,
      personelAdet: sf.aktifPersonelListesi?.length ?? 0,
      fotoVar: Boolean(sf.fotoUrl),
    }))
    .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih), 'tr'));

  const kolajRows: ParselBlokAnalizRow[] = kolajFotolari
    .filter((f) => {
      const p = f.parsel || '';
      const b = f.blok || '';
      if (!matchesLocation(p, b)) return false;
      if (baslangicTarih || bitisTarih) {
        const key = normalizeDateKey(f.yuklemeTarihi);
        if (baslangicTarih && key && key < baslangicTarih) return false;
        if (bitisTarih && key && key > bitisTarih) return false;
      }
      return true;
    })
    .map((f) => ({
      id: f.id,
      tarih: normalizeDateKey(f.yuklemeTarihi) || `${f.yil}-${String(f.ay).padStart(2, '0')}`,
      kaynak: 'Saha Kolaj',
      isNiteligi: f.baslik || f.grupAdi || 'Kolaj Fotoğrafı',
      parsel: f.parsel || '-',
      blok: f.blok || '-',
      aciklama: f.aciklama || '',
      ustaSayisi: 0,
      isciSayisi: 0,
      personelAdet: 0,
      fotoVar: true,
    }));

  const rows = [...faaliyetRows, ...kolajRows].sort((a, b) =>
    String(b.tarih).localeCompare(String(a.tarih), 'tr')
  );

  return {
    toplamFaaliyet: faaliyetRows.length,
    formenKayit: faaliyetRows.filter((r) => r.kaynak === 'Formen Mobil').length,
    idariKayit: faaliyetRows.filter((r) => r.kaynak === 'İdari Saha').length,
    kolajFoto: kolajRows.length,
    toplamUsta: faaliyetRows.reduce((s, r) => s + r.ustaSayisi, 0),
    toplamIsci: faaliyetRows.reduce((s, r) => s + r.isciSayisi, 0),
    toplamPersonelAtama: faaliyetRows.reduce((s, r) => s + r.personelAdet, 0),
    rows,
  };
}
