import { CariKart, Personel } from '../types/erp';
import { personelAdSoyadKey } from '../lib/personelKayitKaliteUtils';

/** YURT MEKANİK taşeron kadrosu — Desktop/YURT.txt; yoklama yazılmaz */
export const YURT_FIRMA_ADI = 'YURT MEKANİK';

type YurtRow = {
  ad: string;
  soyad: string;
  tcNo: string;
  iseGirisTarihi: string;
};

const RAW = `
6	ABDULLAH EKİN	22240740270	6/29/2026
8	ADEM KALKAN	54247706836	04/04/2026
10	AHMET HASAN BAYTAK	51595773046	26.03.2026
11	AHMET TİMUR	54298705178	01/04/2026
14	AYHAN KAYA	40105936200	23.03.2026
15	BERAT ÇAĞDAŞ	40180142268	25.03.2026
17	CENGİZ YÜREK	39767128092	23.03.2026
20	DİLOVAN TUTUK	10544471174	27.03.2026
24	ENES KOŞMAZ 1	41389482100	4/22/2026
26	EREN ERYILMAZ	23890431976	6/8/2026
27	ERTUĞRUL TURHAN	35894142826	7/21/2026
29	FURKAN KARA	62365453082	23.03.2026
31	HALİL ERGİN	17048848594	7/1/2026
32	HALİL İBRAHİM KARAÇAYIR	30040646968	23.03.2026
34	İSMAİL KILIÇ	32171339122	7/16/2026
36	KADİR KAYA	19973238204	6/22/2026
40	MAHMUT ŞAHİN	22202026916	23.03.2026
46	MEHMET ÇETİN	40592000842	7/17/2026
47	MEHMET NURİ ÇAĞDAŞ	30761526426	4/18/2026
48	MEHMET ÖZYAMAN	28181190358	25.03.2026
49	MEHMET YAVUZ	24850392238	5/14/2026
51	METİN SERDAR GÖKÇE	25694676140	23.03.2026
52	MEVLÜT ERTÜRK	47074963336	26.03.2026
55	MUHAMMED ENES ÇAGBARUL	14689444864	25.03.2026
58	MUHAMMET BUĞDAYCI	28780611520	25.03.2026
65	NURİ LEYLEK	26636318128	23.03.2026
66	NURULLAH BOZYİL	25433644720	7/22/2026
68	ÖZCAN TİMUR	13782055854	7/1/2026
69	ÖZGÜR ÇAĞDAŞ	40174142496	4/18/2026
73	SERKAN DEMİRCİ	72715091406	7/1/2026
74	SERKAN DİKÇAL	49822696534	7/18/2026
81	YASİN KÖSE	68545247786	23.03.2026
86	YUSUF KESKİN	18845062688	23.03.2026
89	EMRE SİNAN KIRDAĞ	13593040308	8/3/2026
92	ÖMER BOZYİL	25466643646	8/6/2026
93	ABDURRAHMAN YENİDOĞAN	72325078712	8/6/2026
94	NESİF YENİDOĞAN	72382076836	8/6/2026
94	ABDULKADİR KOŞMAZ	11882057068	8/7/2026
95	HÜSEN KURMUŞ	46708867118	8/7/2026
96	MURAT IRMAK	48088827218	8/10/2026
97	AHMET KARADAŞ	51184724046	8/10/2026
98	MEHMET BULAK	47236856292	8/10/2026
99	MURAT KOŞMAZ	74323012170	8/7/2026
100	ENES BAYTAK	12672070588	8/7/2026
101	MEHMET NEZİR TAŞ	19198843238	8/12/2026
103	ERHAN KOŞMAZ	74326012016	8/13/2026
104	MUHAMMET KURT	71716099022	8/13/2026
105	EMRAH ÖZÇELEBİ	31543910310	8/13/2026
106	AHMET KEÇECİOĞLU	50236017464	8/14/2026
107	SERHAT BULUCU	55465487330	8/14/2026
108	SİNAN BULUCU	15809809044	8/14/2026
109	CUMANAZARO BEGENÇ		8/1/2026
110	BİLAL GÜLCAN	72070087236	8/14/2026
111	ESAT TİLKİ	38963190964	8/14/2026
112	ARİF KURT	74158017654	8/14/2026
113	AGAMERET NUNRYYEV		
114	MEKAN ANNAGURBANOV		8/1/2026
115	AZAT SALYHOW		8/1/2026
116	EREN TARTIŞMAZ	12102112314	8/17/2026
`;

function digits(tc: string): string {
  return String(tc || '').replace(/\D/g, '');
}

function normFirma(s: string): string {
  return String(s || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isYurtFirma(p: Pick<Personel, 'firmaTipi' | 'firmaAdi'>): boolean {
  return p.firmaTipi === 'TASERON' && normFirma(p.firmaAdi || '').includes('YURT');
}

function parseDate(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '2026-08-01';
  if (s.includes('.')) {
    const [d, m, y] = s.split('.');
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parts = s.split('/');
  if (parts.length === 3) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const y = parts[2];
    if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }
  return '2026-08-01';
}

function splitName(full: string): { ad: string; soyad: string } {
  const cleaned = String(full || '')
    .replace(/\s+\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length <= 1) return { ad: cleaned, soyad: '' };
  return { ad: parts.slice(0, -1).join(' '), soyad: parts[parts.length - 1] };
}

function pendingId(ad: string, soyad: string): string {
  const key = personelAdSoyadKey({ ad, soyad }).replace(/\s+/g, '-') || 'X';
  return `PRS-YURT-PENDING-${key}`;
}

function parseRows(): YurtRow[] {
  const out: YurtRow[] = [];
  const seenTc = new Set<string>();
  const seenName = new Set<string>();
  for (const line of RAW.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t').map((x) => x.trim());
    const fullName = String(parts[1] || '').trim();
    if (!fullName) continue;
    const { ad, soyad } = splitName(fullName);
    const tc = digits(parts[2] || '');
    const iseGirisTarihi = parseDate(parts[3] || '');
    const nk = personelAdSoyadKey({ ad, soyad });
    if (tc && seenTc.has(tc)) continue;
    if (!tc && seenName.has(nk)) continue;
    if (tc) seenTc.add(tc);
    seenName.add(nk);
    out.push({ ad, soyad, tcNo: tc, iseGirisTarihi });
  }
  return out;
}

const ROWS = parseRows();

function toPersonel(row: YurtRow): Personel {
  const tc = digits(row.tcNo);
  return {
    id: tc ? `PRS-YURT-${tc}` : pendingId(row.ad, row.soyad),
    tcNo: tc,
    ad: row.ad,
    soyad: row.soyad,
    babaAdi: '',
    dogumTarihi: '',
    telefonNo: '',
    eposta: '',
    adres: '',
    il: '',
    ilce: '',
    departman: 'ŞANTİYE',
    gorev: 'TAŞERON PERSONEL',
    iseGirisTarihi: row.iseGirisTarihi,
    cinsiyet: 'Erkek',
    maas: 0,
    ucretTipi: 'Günlük',
    sgkDurumu: "SGK'lı",
    bankaAdi: '',
    subeAdi: '',
    ibanNo: '',
    durum: true,
    firmaTipi: 'TASERON',
    firmaAdi: YURT_FIRMA_ADI,
    personelGrubu: 'SAHA',
  };
}

export function getYurtPersonelSeed(): Personel[] {
  return ROWS.map(toPersonel);
}

export function makeYurtCari(existingTaseronCount: number): CariKart {
  return {
    id: 'ck_taseron_yurt_mekanik',
    kartTipi: 'TASERON',
    kod: `TSR-YURT-${String(existingTaseronCount + 1).padStart(3, '0')}`,
    unvan: YURT_FIRMA_ADI,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'YURT MEKANİK taşeron personel kaydı',
    iban: '',
    durum: 'AKTIF',
    notlar: 'src/data/yurtPersonelSeed.ts ile oluşturuldu',
  };
}

export function ensureYurtCari(existing: CariKart[]): CariKart | null {
  const found = existing.find((c) => c.kartTipi === 'TASERON' && normFirma(c.unvan).includes('YURT'));
  if (found) return null;
  const taseronCount = existing.filter((c) => c.kartTipi === 'TASERON').length;
  return makeYurtCari(taseronCount);
}

function patchMissing(found: Personel, seed: Personel): Personel {
  const foundTc = digits(found.tcNo);
  return {
    ...found,
    ad: found.ad || seed.ad,
    soyad: found.soyad || seed.soyad,
    tcNo: foundTc || seed.tcNo,
    iseGirisTarihi: found.iseGirisTarihi || seed.iseGirisTarihi,
    firmaTipi: 'TASERON',
    firmaAdi: found.firmaAdi || YURT_FIRMA_ADI,
    personelGrubu: found.personelGrubu || 'SAHA',
    durum: found.durum !== false,
  };
}

function needsPatch(found: Personel, seed: Personel): boolean {
  const foundTc = digits(found.tcNo);
  return (
    (!found.ad && !!seed.ad) ||
    (!found.soyad && !!seed.soyad) ||
    (!foundTc && !!seed.tcNo) ||
    (!found.iseGirisTarihi && !!seed.iseGirisTarihi) ||
    (isYurtFirma(found) && ((found.ad || '') !== seed.ad || (found.soyad || '') !== seed.soyad))
  );
}

/**
 * Eksik YURT MEKANİK personelini ekler; mevcut kartı silmez / pasife almaz.
 * TC eşleşirse id korunur (kamp/yoklama bağı). Yoklama yazılmaz.
 */
export function mergeYurtIntoPersonelList(existing: Personel[]): {
  list: Personel[];
  toSave: Personel[];
} {
  const seed = getYurtPersonelSeed();
  const byTc = new Map<string, Personel>();
  const byYurtName = new Map<string, Personel>();
  existing.forEach((p) => {
    const tc = digits(p.tcNo);
    if (tc) byTc.set(tc, p);
    if (isYurtFirma(p)) byYurtName.set(personelAdSoyadKey(p), p);
  });

  const toSave: Personel[] = [];
  const next = [...existing];

  for (const s of seed) {
    const tc = digits(s.tcNo);
    const nk = personelAdSoyadKey(s);

    const byTcHit = tc ? byTc.get(tc) : undefined;
    if (byTcHit) {
      if (byTcHit.firmaTipi === 'ANA_FIRMA') continue;
      if (!isYurtFirma(byTcHit) && String(byTcHit.firmaAdi || '').trim()) continue;
      if (!needsPatch(byTcHit, s) && isYurtFirma(byTcHit)) continue;
      const patched = patchMissing(byTcHit, s);
      const idx = next.findIndex((p) => p.id === byTcHit.id);
      if (idx >= 0) next[idx] = patched;
      toSave.push(patched);
      if (tc) byTc.set(tc, patched);
      byYurtName.set(personelAdSoyadKey(patched), patched);
      continue;
    }

    const byNameHit = byYurtName.get(nk);
    if (byNameHit) {
      if (!needsPatch(byNameHit, s)) continue;
      const patched = patchMissing(byNameHit, s);
      const idx = next.findIndex((p) => p.id === byNameHit.id);
      if (idx >= 0) next[idx] = patched;
      toSave.push(patched);
      if (digits(patched.tcNo)) byTc.set(digits(patched.tcNo), patched);
      byYurtName.set(nk, patched);
      continue;
    }

    next.push(s);
    if (tc) byTc.set(tc, s);
    byYurtName.set(nk, s);
    toSave.push(s);
  }

  return { list: next, toSave };
}
