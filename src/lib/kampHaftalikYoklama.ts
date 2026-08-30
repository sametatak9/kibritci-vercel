import {
  AylikYoklamaMap,
  GunlukYoklama,
  KampKaydi,
  KampOdasi,
  Personel,
  YoklamaDurum,
} from '../types/erp';
import { saveDocument } from './firebase';
import { isTaseronPersonel } from './yoklamaUtils';

export interface HaftalikGunKaydi {
  gunNo: number;
  tarih: string;
  durum: YoklamaDurum;
  mesaiSaati: number;
}

export interface OdaYoklamaSatir {
  odaId: string;
  odaLabel: string;
  personelId?: string;
  personelIsim: string;
  firma?: string;
  gunler: HaftalikGunKaydi[];
  originalGunler: HaftalikGunKaydi[];
}

export function getCurrentMonthMeta(): { yil: number; ay: number; ayAdi: string } {
  const now = new Date();
  return {
    yil: now.getFullYear(),
    ay: now.getMonth() + 1,
    ayAdi: now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
  };
}

export function getHaftalikGunNumaralari(ayGunSayisi = 31): number[] {
  const today = new Date();
  const currentDay = today.getDate();
  const start = Math.max(1, currentDay - 6);
  const days: number[] = [];
  for (let d = start; d <= Math.min(currentDay, ayGunSayisi); d++) days.push(d);
  return days;
}

function resolvePersonelId(reg: KampKaydi, personeller: Personel[]): string | undefined {
  if (reg.personelId) return reg.personelId;
  const match = personeller.find(
    (p) => `${p.ad} ${p.soyad}`.toLowerCase().trim() === reg.personelIsim.toLowerCase().trim()
  );
  return match?.id;
}

export function buildOdaYoklamaSatirlari(
  kampOdalari: KampOdasi[],
  kampKayitlari: KampKaydi[],
  yoklamalar: AylikYoklamaMap,
  personeller: Personel[],
  gunNumaralari: number[]
): OdaYoklamaSatir[] {
  const rows: OdaYoklamaSatir[] = [];
  const { yil, ay } = getCurrentMonthMeta();

  for (const room of kampOdalari) {
    const occupants = kampKayitlari.filter(
      (k) => (k.odaId === room.id || k.roomId === room.id) && k.durum === 'AKTIF'
    );
    for (const reg of occupants) {
      const pid = resolvePersonelId(reg, personeller);
      if (pid) {
        const pObj = personeller.find(p => p.id === pid);
        if (pObj && isTaseronPersonel(pObj)) continue;
      }
      const personYok = pid ? yoklamalar[pid] : undefined;
      const gunler: HaftalikGunKaydi[] = gunNumaralari.map((gunNo) => {
        const existing = personYok?.[gunNo];
        const tarih = `${yil}-${String(ay).padStart(2, '0')}-${String(gunNo).padStart(2, '0')}`;
        return {
          gunNo,
          tarih,
          durum: existing?.durum ?? 'Girilmedi',
          mesaiSaati: existing?.mesaiSaati ?? 0,
        };
      });
      rows.push({
        odaId: room.id,
        odaLabel: `${room.yerleskeAdi} · ${room.kogusNo} · Oda ${room.odaNo}`,
        personelId: pid,
        personelIsim: reg.personelIsim,
        firma: reg.calistigiFirma,
        gunler,
        originalGunler: gunler.map((g) => ({ ...g })),
      });
    }
  }
  return rows;
}

export function diffOdaYoklamaSatir(row: OdaYoklamaSatir): string[] {
  const changes: string[] = [];
  row.gunler.forEach((g, i) => {
    const orig = row.originalGunler[i];
    if (!orig) return;
    if (g.durum !== orig.durum || g.mesaiSaati !== orig.mesaiSaati) {
      changes.push(
        `  Gün ${g.gunNo}: ${orig.durum} (mesai ${orig.mesaiSaati}s) → ${g.durum} (mesai ${g.mesaiSaati}s)`
      );
    }
  });
  if (changes.length === 0) return [];
  return [`${row.personelIsim} — ${row.odaLabel}`, ...changes];
}

export function buildHaftalikYoklamaRaporu(odaDiffs: string[][], hazirlayan: string): string {
  const { ayAdi } = getCurrentMonthMeta();
  const flat = odaDiffs.flat();
  const body = flat.length === 0 ? 'Haftalık yoklamada değişiklik yapılmadı.' : flat.join('\n');
  return [
    'KİBRİTÇİ İNŞAAT — KAMP HAFTALIK YOKLAMA RAPORU',
    `Dönem: ${ayAdi}`,
    `Hazırlayan: ${hazirlayan}`,
    `Tarih: ${new Date().toLocaleString('tr-TR')}`,
    '',
    '--- DEĞİŞİKLİK ÖZETİ ---',
    body,
  ].join('\n');
}

export function mergeHaftalikIntoYoklamalar(
  yoklamalar: AylikYoklamaMap,
  satirlar: OdaYoklamaSatir[]
): AylikYoklamaMap {
  const next: AylikYoklamaMap = { ...yoklamalar };
  for (const row of satirlar) {
    if (!row.personelId) continue;
    const existing: GunlukYoklama = { ...(next[row.personelId] || {}) };
    for (const g of row.gunler) {
      existing[g.gunNo] = { durum: g.durum, mesaiSaati: g.mesaiSaati };
    }
    next[row.personelId] = existing;
  }
  return next;
}

export async function archiveHaftalikYoklamaRaporu(rapor: string, hazirlayan: string): Promise<void> {
  await saveDocument('kampHaftalikYoklamaRaporlari', {
    id: `khy_${Date.now()}`,
    tarih: new Date().toISOString(),
    hazirlayan,
    rapor,
  });
}

export function emailHaftalikYoklamaRaporu(rapor: string, konu: string): void {
  const yonetim = 'yonetim@kibritci.com';
  const body = encodeURIComponent(rapor);
  const subject = encodeURIComponent(konu);
  window.location.href = `mailto:${yonetim}?subject=${subject}&body=${body}`;
}
