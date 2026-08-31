/** Günlük akış raporu — Formen / Kampçı gün sonu özeti */

export type GunlukAkisTip = 'FORMEN' | 'KAMPÇI';

export interface GunlukAkisRapor {
  id: string;
  tip: GunlukAkisTip;
  tarih: string;
  gonderenEmail: string;
  gonderenAd?: string;
  ozetMetin: string;
  yoklamaOzet?: {
    gelen: number;
    gelmeyen: number;
    toplam: number;
    isimler?: string[];
  };
  sahaFaaliyetSayisi?: number;
  personelIslemSayisi?: number;
  kampIslemSayisi?: number;
  durum: 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDİLDİ';
  onaylayan?: string | null;
  onaylayanYetki?: string | null;
  onayTarihi?: string | null;
  olusturulma: string;
}

export function buildFormenGunlukOzet(input: {
  tarih: string;
  email: string;
  gelen: number;
  gelmeyen: number;
  toplam: number;
  gelenIsimler: string[];
  sahaCount: number;
  girisCount: number;
  cikisCount: number;
  mesaiToplamSaat?: number;
  sahaOzetleri?: string[];
}): string {
  const mesai =
    typeof input.mesaiToplamSaat === 'number' && input.mesaiToplamSaat > 0
      ? `Mesai toplamı: ${input.mesaiToplamSaat} saat`
      : 'Mesai toplamı: —';
  const sahaSatirlar = (input.sahaOzetleri || []).filter(Boolean).slice(0, 8);

  return [
    'KİBRİTÇİ A.Ş. — FORMEN GÜNLÜK AKIŞ RAPORU',
    `Tarih: ${input.tarih.split('-').reverse().join('.')}`,
    `Formen: ${input.email}`,
    '',
    `Yoklama: ${input.gelen}/${input.toplam} personel sahada`,
    input.gelenIsimler.length ? `Gelenler: ${input.gelenIsimler.slice(0, 15).join(', ')}` : '',
    mesai,
    `Saha faaliyeti kaydı: ${input.sahaCount} adet`,
    ...sahaSatirlar.map((s) => `• ${s}`),
    `Personel giriş talebi: ${input.girisCount} · çıkış talebi: ${input.cikisCount}`,
    '',
    'Bu rapor yönetim onayına sunulmuştur / şefe WhatsApp ile iletilebilir.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildKampciGunlukOzet(input: {
  tarih: string;
  email: string;
  yerlesimCount: number;
  sayimCount: number;
  faaliyetCount: number;
}): string {
  return [
    'KİBRİTÇİ A.Ş. — KAMPÇI GÜNLÜK AKIŞ RAPORU',
    `Tarih: ${input.tarih.split('-').reverse().join('.')}`,
    `Kampçı: ${input.email}`,
    '',
    `Yerleşim işlemi: ${input.yerlesimCount}`,
    `Depo sayım kaydı: ${input.sayimCount}`,
    `Günlük faaliyet: ${input.faaliyetCount}`,
    '',
    'Bu rapor yönetim onayına sunulmuştur.',
  ].join('\n');
}
