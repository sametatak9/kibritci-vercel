import { Irsaliye, IrsaliyeItem, SatinAlmaItem, SatinAlmaTalebi } from '../types/erp';

/** SA kalemine bağlı irsaliyelerde teslim edilen toplam miktar */
export function deliveredMiktarForSaKalem(
  sa: SatinAlmaTalebi,
  kalem: SatinAlmaItem,
  irsaliyeler: Irsaliye[]
): number {
  const linked = irsaliyeler.filter((ir) => ir.saId === sa.saId || ir.saId === sa.id);
  let sum = 0;
  for (const ir of linked) {
    for (const ik of ir.kalemler || []) {
      if (ik.saKalemId === kalem.id) {
        sum += Number(ik.miktar) || 0;
        continue;
      }
      // saKalemId yoksa ürün adı eşleşmesi
      if (
        !ik.saKalemId &&
        String(ik.urunAdi || '')
          .trim()
          .toLocaleLowerCase('tr-TR') ===
          String(kalem.urunAdi || '')
            .trim()
            .toLocaleLowerCase('tr-TR')
      ) {
        sum += Number(ik.miktar) || 0;
      }
    }
  }
  return sum;
}

export function kalanMiktarForSaKalem(
  sa: SatinAlmaTalebi,
  kalem: SatinAlmaItem,
  irsaliyeler: Irsaliye[]
): number {
  return Math.max(0, (Number(kalem.miktar) || 0) - deliveredMiktarForSaKalem(sa, kalem, irsaliyeler));
}

export type SaIrsaliyeTeslimat = {
  /** SA kalem id */
  saKalemId: string;
  /** Bu irsaliyedeki miktar (örn. 1 TIR tonajı) */
  miktar: number;
  birim?: string;
  plaka?: string;
  not?: string;
};

/**
 * Tek SA'dan N irsaliye üretir (örn. 20 araba mıcır → 20 irsaliye).
 * Her teslimat satırı ayrı irsaliye dokümanı olur.
 */
export function createIrsaliyelerFromSatinAlma(
  sa: SatinAlmaTalebi,
  deliveries: SaIrsaliyeTeslimat[],
  opts?: { tarih?: string; firma?: string }
): Irsaliye[] {
  const tarih = opts?.tarih || new Date().toISOString().split('T')[0];
  const firma = opts?.firma || sa.cariFirma || '';
  const stamp = Date.now();

  return deliveries.map((d, idx) => {
    const kalem = sa.kalemler.find((k) => k.id === d.saKalemId);
    const urunAdi = kalem?.urunAdi || 'Kalem';
    const birim = d.birim || kalem?.birim || 'ADET';
    const irId = `IR-SA-${stamp}-${idx + 1}`;
    const item: IrsaliyeItem = {
      id: `iri_${stamp}_${idx}`,
      saKalemId: d.saKalemId,
      urunAdi,
      miktar: Number(d.miktar) || 0,
      birim,
    };
    return {
      id: irId,
      irsaliyeId: irId,
      irsaliyeNo: `${sa.saId}-IR-${String(idx + 1).padStart(3, '0')}`,
      saId: sa.saId,
      firma,
      tarih,
      onayDurumu: 'ONAY BEKLİYOR' as const,
      kalemler: [item],
      eImzalar: [],
      fisEvrakUrl: d.plaka ? `Plaka: ${d.plaka}${d.not ? ` · ${d.not}` : ''}` : d.not,
      donusumKaynagi: 'SA_DONUSUM',
    };
  });
}

/** SA kaleminden N adet (varsayılan 1'er birim) irsaliye şablonu */
export function buildNDeliveryTemplates(
  sa: SatinAlmaTalebi,
  saKalemId: string,
  adet: number,
  miktarPerIrsaliye = 1
): SaIrsaliyeTeslimat[] {
  const n = Math.max(0, Math.floor(adet));
  const kalem = sa.kalemler.find((k) => k.id === saKalemId);
  return Array.from({ length: n }, () => ({
    saKalemId,
    miktar: miktarPerIrsaliye,
    birim: kalem?.birim,
  }));
}
