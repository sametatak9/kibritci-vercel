import {
  EvrakBaglantiGrubu,
  Fatura,
  Irsaliye,
  KalemBaglantisi,
  SatinAlmaTalebi,
} from '../types/erp';
import { filterLinkedIrsaliyeler, faturaIsLinked, irsaliyeMatchesRef } from './documentLinkUtils';

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesSimilar(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function irsaliyeIsLinked(ir: Irsaliye): boolean {
  return Boolean(ir.saId || ir.faturaNo);
}

export function suggestKalemBaglantilari(
  sa: SatinAlmaTalebi | undefined,
  irsaliyeler: Irsaliye[],
  fatura: Fatura | undefined
): KalemBaglantisi[] {
  const links: KalemBaglantisi[] = [];
  const usedIrKalem = new Set<string>();

  sa?.kalemler.forEach((sk) => {
    // Aynı SA kalemine bağlı tüm irsaliye satırlarını topla (20 TIR → tonaj toplamı)
    const matched: Array<{ ir: Irsaliye; kalem: (typeof irsaliyeler)[0]['kalemler'][0] }> = [];
    for (const ir of irsaliyeler) {
      for (const ik of ir.kalemler) {
        const key = `${ir.id}-${ik.id}`;
        if (usedIrKalem.has(key)) continue;
        const byId = ik.saKalemId && ik.saKalemId === sk.id;
        const byName = namesSimilar(sk.urunAdi, ik.urunAdi);
        if (byId || byName) {
          matched.push({ ir, kalem: ik });
          usedIrKalem.add(key);
        }
      }
    }

    const bestIr = matched[0] || null;
    const irsaliyeMiktarToplam = matched.reduce((s, m) => s + (Number(m.kalem.miktar) || 0), 0);

    let ftKalem = fatura?.kalemler.find((fk) => namesSimilar(fk.urunAdi, sk.urunAdi));
    if (!ftKalem && bestIr) {
      ftKalem = fatura?.kalemler.find((fk) => namesSimilar(fk.urunAdi, bestIr!.kalem.urunAdi));
    }

    links.push({
      id: `kb_${sk.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      urunAdi: sk.urunAdi,
      saKalemId: sk.id,
      irsaliyeKalemId: bestIr?.kalem.id,
      irsaliyeId: bestIr?.ir.id,
      faturaKalemId: ftKalem?.id,
      saMiktar: sk.miktar,
      irsaliyeMiktar: matched.length ? irsaliyeMiktarToplam : undefined,
      faturaMiktar: ftKalem?.miktar,
      birim: sk.birim || bestIr?.kalem.birim || ftKalem?.birim,
      onaylandi: Boolean(matched.length || ftKalem),
    });
  });

  for (const ir of irsaliyeler) {
    for (const ik of ir.kalemler) {
      const key = `${ir.id}-${ik.id}`;
      if (usedIrKalem.has(key)) continue;
      const already = links.some((l) => l.irsaliyeKalemId === ik.id && l.irsaliyeId === ir.id);
      if (already) continue;
      const ftKalem = fatura?.kalemler.find((fk) => namesSimilar(fk.urunAdi, ik.urunAdi));
      links.push({
        id: `kb_ir_${ik.id}_${Date.now()}`,
        urunAdi: ik.urunAdi,
        irsaliyeKalemId: ik.id,
        irsaliyeId: ir.id,
        faturaKalemId: ftKalem?.id,
        irsaliyeMiktar: ik.miktar,
        faturaMiktar: ftKalem?.miktar,
        birim: ik.birim,
        onaylandi: Boolean(ftKalem),
      });
      usedIrKalem.add(key);
    }
  }

  fatura?.kalemler.forEach((fk) => {
    if (links.some((l) => l.faturaKalemId === fk.id)) return;
    links.push({
      id: `kb_ft_${fk.id}_${Date.now()}`,
      urunAdi: fk.urunAdi,
      faturaKalemId: fk.id,
      faturaMiktar: fk.miktar,
      birim: fk.birim,
      onaylandi: false,
    });
  });

  return links;
}

export interface ApplyBindingInput {
  saId?: string;
  irsaliyeIds: string[];
  faturaId?: string;
  kalemBaglantilari: KalemBaglantisi[];
}

export function applyEvrakBinding(
  input: ApplyBindingInput,
  irsaliyeler: Irsaliye[],
  faturalar: Fatura[]
): { irsaliyeler: Irsaliye[]; faturalar: Fatura[] } {
  const fatura = input.faturaId ? faturalar.find((f) => f.id === input.faturaId) : undefined;
  const faturaNo = fatura?.faturaNo;

  const nextIrs = irsaliyeler.map((ir) => {
    if (!input.irsaliyeIds.includes(ir.id)) {
      if (faturaNo && ir.faturaNo === faturaNo && input.faturaId) {
        return { ...ir, faturaNo: undefined };
      }
      return ir;
    }
    return {
      ...ir,
      saId: input.saId || ir.saId,
      faturaNo: faturaNo || ir.faturaNo,
    };
  });

  const nextFt = faturalar.map((ft) => {
    if (input.faturaId && ft.id === input.faturaId) {
      return {
        ...ft,
        saId: input.saId || ft.saId,
        bagliIrsaliyeler: input.irsaliyeIds,
      };
    }
    if (faturaNo && input.faturaId) {
      const refs = ft.bagliIrsaliyeler.filter(
        (ref) => !input.irsaliyeIds.some((id) => irsaliyeMatchesRef({ id } as Irsaliye, ref))
      );
      if (refs.length !== ft.bagliIrsaliyeler.length && ft.id !== input.faturaId) {
        return { ...ft, bagliIrsaliyeler: refs };
      }
    }
    return ft;
  });

  return { irsaliyeler: nextIrs, faturalar: nextFt };
}

export function buildBaglantiGrubu(
  input: ApplyBindingInput,
  irsaliyeler: Irsaliye[],
  faturalar: Fatura[],
  satinAlmaTalepleri: SatinAlmaTalebi[],
  olusturan?: string
): EvrakBaglantiGrubu {
  const fatura = input.faturaId ? faturalar.find((f) => f.id === input.faturaId) : undefined;
  const sa = input.saId ? satinAlmaTalepleri.find((s) => s.saId === input.saId) : undefined;
  const cari =
    fatura?.cariUnvan ||
    irsaliyeler.find((ir) => input.irsaliyeIds.includes(ir.id))?.firma ||
    sa?.talepEden;

  return {
    id: `ebg_${Date.now()}`,
    olusturmaTarihi: new Date().toISOString().split('T')[0],
    saId: input.saId,
    irsaliyeIds: input.irsaliyeIds,
    faturaId: input.faturaId,
    kalemBaglantilari: input.kalemBaglantilari.filter((k) => k.onaylandi),
    durum: 'ANALIZ_BEKLIYOR',
    olusturan,
    cariUnvan: cari,
  };
}

/** Mevcut entity bağlantılarından havuz grupları türet */
export function deriveBaglantiGruplariFromEntities(
  faturalar: Fatura[],
  irsaliyeler: Irsaliye[],
  satinAlmaTalepleri: SatinAlmaTalebi[],
  existing: EvrakBaglantiGrubu[]
): EvrakBaglantiGrubu[] {
  const byKey = new Map<string, EvrakBaglantiGrubu>();
  for (const g of existing) {
    const key = `${g.saId || ''}|${g.faturaId || ''}|${g.irsaliyeIds.sort().join(',')}`;
    byKey.set(key, g);
  }

  for (const ft of faturalar) {
    if (!faturaIsLinked(ft)) continue;
    const linkedIrs = filterLinkedIrsaliyeler(irsaliyeler, ft.bagliIrsaliyeler);
    const irIds = linkedIrs.map((ir) => ir.id);
    const key = `${ft.saId || ''}|${ft.id}|${irIds.sort().join(',')}`;
    if (byKey.has(key)) continue;

    const sa = ft.saId ? satinAlmaTalepleri.find((s) => s.saId === ft.saId) : undefined;
    const kalemBaglantilari = suggestKalemBaglantilari(sa, linkedIrs, ft).map((k) => ({
      ...k,
      onaylandi: true,
    }));

    byKey.set(key, {
      id: `ebg_derived_${ft.id}`,
      olusturmaTarihi: ft.tarih,
      saId: ft.saId,
      irsaliyeIds: irIds.length ? irIds : linkedIrs.map((ir) => ir.id),
      faturaId: ft.id,
      kalemBaglantilari,
      durum: 'ANALIZ_BEKLIYOR',
      cariUnvan: ft.cariUnvan,
    });
  }

  for (const ir of irsaliyeler) {
    if (!ir.saId && !ir.faturaNo) continue;
    const ft = ir.faturaNo ? faturalar.find((f) => f.faturaNo === ir.faturaNo) : undefined;
    if (ft && faturaIsLinked(ft)) continue;

    const sameSaIrs = ir.saId ? irsaliyeler.filter((x) => x.saId === ir.saId) : [ir];
    const irIds = sameSaIrs.map((x) => x.id);
    const key = `${ir.saId || ''}|${ft?.id || ''}|${irIds.sort().join(',')}`;
    if (byKey.has(key)) continue;

    const sa = ir.saId ? satinAlmaTalepleri.find((s) => s.saId === ir.saId) : undefined;
    byKey.set(key, {
      id: `ebg_derived_ir_${ir.id}`,
      olusturmaTarihi: ir.tarih,
      saId: ir.saId,
      irsaliyeIds: irIds,
      faturaId: ft?.id,
      kalemBaglantilari: suggestKalemBaglantilari(sa, sameSaIrs, ft).map((k) => ({
        ...k,
        onaylandi: true,
      })),
      durum: 'ANALIZ_BEKLIYOR',
      cariUnvan: ir.firma,
    });
  }

  return Array.from(byKey.values()).sort(
    (a, b) => b.olusturmaTarihi.localeCompare(a.olusturmaTarihi)
  );
}

export function getAnalizHavuzu(
  gruplar: EvrakBaglantiGrubu[],
  faturalar: Fatura[],
  irsaliyeler: Irsaliye[],
  satinAlmaTalepleri: SatinAlmaTalebi[]
): EvrakBaglantiGrubu[] {
  const merged = deriveBaglantiGruplariFromEntities(
    faturalar,
    irsaliyeler,
    satinAlmaTalepleri,
    gruplar
  );
  return merged.filter(
    (g) =>
      g.durum === 'ANALIZ_BEKLIYOR' ||
      g.durum === 'KALEM_ONAYLANDI' ||
      (g.kalemBaglantilari.length > 0 && (g.saId || g.faturaId || g.irsaliyeIds.length))
  );
}
