/** İç mimari hedef görseller — public/mimari (resize edilmiş) */

export type MimariGorsel = {
  id: string;
  src: string;
  baslik: string;
  kategori: 'islak' | 'mutfak' | 'salon' | 'yatak' | 'hol' | 'giris' | 'genel';
  odaKeys: string[];
};

export const MIMARI_GORSEL_PARSEL: Record<string, MimariGorsel[]> = {
  'Parsel Bölge 157/46': [
    { id: '157-46-arn-c1-c2_blok-g-r-hol.jpg', src: '/mimari/157-46/arn-c1-c2_blok-g-r-hol.jpg', baslik: 'ARN-C1-C2_BLOK-GİRİŞ HOLÜ', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '157-46-arn-g-h-i-blok-kat-hol.jpg', src: '/mimari/157-46/arn-g-h-i-blok-kat-hol.jpg', baslik: 'ARN-G-H-I BLOK KAT HOLÜ', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '157-46-arn-genel-blok-kapi-g-r-n.jpg', src: '/mimari/157-46/arn-genel-blok-kapi-g-r-n.jpg', baslik: 'ARN-GENEL BLOK-KAPI GÖRÜNÜŞÜ', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '157-46-04-kiz-ocuk-odasi.jpg', src: '/mimari/157-46/04-kiz-ocuk-odasi.jpg', baslik: '04-KIZ ÇOCUK ODASI', kategori: 'yatak', odaKeys: ["yatak1", "yatak2", "yatak3"] },
    { id: '157-46-05-erkek-ocuk-odasi.jpg', src: '/mimari/157-46/05-erkek-ocuk-odasi.jpg', baslik: '05-ERKEK ÇOCUK ODASI', kategori: 'yatak', odaKeys: ["yatak1", "yatak2", "yatak3"] },
    { id: '157-46-banyo-1.jpg', src: '/mimari/157-46/banyo-1.jpg', baslik: 'BANYO 1', kategori: 'islak', odaKeys: ["islak"] },
    { id: '157-46-banyo-2.jpg', src: '/mimari/157-46/banyo-2.jpg', baslik: 'BANYO 2 ', kategori: 'islak', odaKeys: ["islak"] },
  ],
  'Parsel Bölge 157/51': [
    { id: '157-51-kat-hol-_1.jpg', src: '/mimari/157-51/kat-hol-_1.jpg', baslik: 'KAT HOLÜ_1', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '157-51-r-zgarlik.jpg', src: '/mimari/157-51/r-zgarlik.jpg', baslik: 'RÜZGARLIK', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '157-51-banyo_render_1.jpg', src: '/mimari/157-51/banyo_render_1.jpg', baslik: 'Banyo_Render_1', kategori: 'islak', odaKeys: ["islak"] },
    { id: '157-51-banyo_render_2.jpg', src: '/mimari/157-51/banyo_render_2.jpg', baslik: 'Banyo_Render_2', kategori: 'islak', odaKeys: ["islak"] },
    { id: '157-51-koridor_render.jpg', src: '/mimari/157-51/koridor_render.jpg', baslik: 'Koridor_Render', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '157-51-mutfak_2.jpg', src: '/mimari/157-51/mutfak_2.jpg', baslik: 'MUTFAK_2', kategori: 'mutfak', odaKeys: ["mutfak"] },
    { id: '157-51-mutfak_render_1.jpg', src: '/mimari/157-51/mutfak_render_1.jpg', baslik: 'Mutfak_Render_1', kategori: 'mutfak', odaKeys: ["mutfak"] },
    { id: '157-51-oda-1.jpg', src: '/mimari/157-51/oda-1.jpg', baslik: 'Oda 1', kategori: 'yatak', odaKeys: ["yatak1", "yatak2", "yatak3"] },
    { id: '157-51-oda_2_final.jpg', src: '/mimari/157-51/oda_2_final.jpg', baslik: 'Oda_2_Final', kategori: 'yatak', odaKeys: ["yatak1", "yatak2", "yatak3"] },
    { id: '157-51-salon_render_1.jpg', src: '/mimari/157-51/salon_render_1.jpg', baslik: 'Salon_Render_1', kategori: 'salon', odaKeys: ["salon"] },
    { id: '157-51-salon_render_2.jpg', src: '/mimari/157-51/salon_render_2.jpg', baslik: 'Salon_Render_2', kategori: 'salon', odaKeys: ["salon"] },
  ],
  'Parsel Bölge 160/2': [
    { id: '160-2-enterance-01.jpg', src: '/mimari/160-2/enterance-01.jpg', baslik: 'Enterance 01', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '160-2-enterance-02.jpg', src: '/mimari/160-2/enterance-02.jpg', baslik: 'Enterance 02', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '160-2-enterance-03.jpg', src: '/mimari/160-2/enterance-03.jpg', baslik: 'Enterance 03', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '160-2-hallway-01.jpg', src: '/mimari/160-2/hallway-01.jpg', baslik: 'Hallway 01', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '160-2-hallway-02.jpg', src: '/mimari/160-2/hallway-02.jpg', baslik: 'Hallway 02', kategori: 'hol', odaKeys: ["hol", "giris"] },
    { id: '160-2-01.jpg', src: '/mimari/160-2/01.jpg', baslik: '01', kategori: 'genel', odaKeys: [] },
    { id: '160-2-02.jpg', src: '/mimari/160-2/02.jpg', baslik: '02', kategori: 'genel', odaKeys: [] },
    { id: '160-2-03.jpg', src: '/mimari/160-2/03.jpg', baslik: '03', kategori: 'genel', odaKeys: [] },
    { id: '160-2-044.jpg', src: '/mimari/160-2/044.jpg', baslik: '044', kategori: 'genel', odaKeys: [] },
    { id: '160-2-055.jpg', src: '/mimari/160-2/055.jpg', baslik: '055', kategori: 'genel', odaKeys: [] },
    { id: '160-2-06.jpg', src: '/mimari/160-2/06.jpg', baslik: '06', kategori: 'genel', odaKeys: [] },
    { id: '160-2-07.jpg', src: '/mimari/160-2/07.jpg', baslik: '07', kategori: 'genel', odaKeys: [] },
    { id: '160-2-08.jpg', src: '/mimari/160-2/08.jpg', baslik: '08', kategori: 'genel', odaKeys: [] },
    { id: '160-2-09.jpg', src: '/mimari/160-2/09.jpg', baslik: '09', kategori: 'genel', odaKeys: [] },
    { id: '160-2-10.jpg', src: '/mimari/160-2/10.jpg', baslik: '10', kategori: 'genel', odaKeys: [] },
    { id: '160-2-122.jpg', src: '/mimari/160-2/122.jpg', baslik: '122', kategori: 'genel', odaKeys: [] },
    { id: '160-2-133.jpg', src: '/mimari/160-2/133.jpg', baslik: '133', kategori: 'genel', odaKeys: [] },
  ],
};

export function mimariGorsellerForParsel(parsel: string): MimariGorsel[] {
  return MIMARI_GORSEL_PARSEL[parsel] || [];
}

export function mimariGorsellerForOda(parsel: string, odaKey: string): MimariGorsel[] {
  const all = mimariGorsellerForParsel(parsel);
  const hit = all.filter((g) => g.odaKeys.includes(odaKey));
  return hit.length ? hit : all.filter((g) => g.kategori === 'genel' || g.odaKeys.length === 0);
}
