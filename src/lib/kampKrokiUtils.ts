import { KampKaydi, KampOdasi, Personel } from '../types/erp';
import { resolveKampYerlesimFirma } from './kampFirmaOzet';

export type KampFirmaKisi = {
  firma: string;
  kisi: number;
  odaSayisi: number;
};

export type KampOdaKrokiHucre = {
  room: KampOdasi;
  dolu: number;
  kapasite: number;
  firmalar: KampFirmaKisi[];
  dominantFirma: string | null;
  sakinler: Array<{ id: string; isim: string; firma: string }>;
};

export type KampKatKroki = {
  yerleske: string;
  kat: string;
  odaSayisi: number;
  kapasite: number;
  dolu: number;
  firmalar: KampFirmaKisi[];
  odalar: KampOdaKrokiHucre[];
};

export type KampYerleskeKroki = {
  yerleske: string;
  kapasite: number;
  dolu: number;
  katlar: KampKatKroki[];
  firmalar: KampFirmaKisi[];
};

/** Stabil firma renkleri — kroki hücreleri ve legend için */
const FIRMA_PALETTE = [
  { bg: '#0F6C5C', soft: '#E3F2EE', text: '#0A4A3F' },
  { bg: '#C45C26', soft: '#FBEDE4', text: '#7A3414' },
  { bg: '#1F4E79', soft: '#E8F0F7', text: '#143352' },
  { bg: '#A67C00', soft: '#FBF3D9', text: '#6B5000' },
  { bg: '#7A3E5C', soft: '#F5E8EF', text: '#4E2740' },
  { bg: '#3D6B4F', soft: '#E7F2EB', text: '#274836' },
  { bg: '#8B4513', soft: '#F4E8DE', text: '#5C2E0C' },
  { bg: '#2F5D62', soft: '#E4F0F1', text: '#1E3D41' },
  { bg: '#6B4F2A', soft: '#F3EBDE', text: '#46331B' },
  { bg: '#4A5568', soft: '#EDF0F4', text: '#2D3748' },
];

function hashFirma(name: string): number {
  const s = String(name || '').toLocaleUpperCase('tr-TR');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function firmaKrokiColor(firma: string): { bg: string; soft: string; text: string } {
  return FIRMA_PALETTE[hashFirma(firma) % FIRMA_PALETTE.length];
}

function emptyFirmaMap(): Map<string, { kisi: number; odalar: Set<string> }> {
  return new Map();
}

function bumpFirma(
  map: Map<string, { kisi: number; odalar: Set<string> }>,
  firma: string,
  odaId?: string
) {
  const key = String(firma || 'TAŞERON').trim() || 'TAŞERON';
  let row = map.get(key);
  if (!row) {
    row = { kisi: 0, odalar: new Set() };
    map.set(key, row);
  }
  row.kisi += 1;
  if (odaId) row.odalar.add(odaId);
}

function toFirmaList(map: Map<string, { kisi: number; odalar: Set<string> }>): KampFirmaKisi[] {
  return Array.from(map.entries())
    .map(([firma, v]) => ({
      firma,
      kisi: v.kisi,
      odaSayisi: v.odalar.size,
    }))
    .sort((a, b) => b.kisi - a.kisi || a.firma.localeCompare(b.firma, 'tr'));
}

function floorSort(a: string, b: string) {
  return a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
}

function roomSort(a: KampOdasi, b: KampOdasi) {
  return (a.odaNo || '').localeCompare(b.odaNo || '', 'tr', { numeric: true, sensitivity: 'base' });
}

/**
 * Yerleşke → kat → firma kişi sayısı + oda hücreleri (görsel kroki için).
 */
export function buildKampKrokiModel(
  kampOdalari: KampOdasi[],
  kampKayitlari: KampKaydi[],
  personeller: Personel[]
): KampYerleskeKroki[] {
  const aktif = kampKayitlari.filter((k) => k.durum === 'AKTIF');
  const byRoom = new Map<string, KampKaydi[]>();
  for (const k of aktif) {
    const rid = k.odaId || k.roomId;
    if (!rid) continue;
    if (!byRoom.has(rid)) byRoom.set(rid, []);
    byRoom.get(rid)!.push(k);
  }

  const campusNames = Array.from(
    new Set(kampOdalari.map((r) => r.yerleskeAdi || 'Bilinmeyen Yerleşke'))
  ).sort(floorSort);

  return campusNames.map((yerleske) => {
    const campusRooms = kampOdalari.filter((r) => (r.yerleskeAdi || 'Bilinmeyen Yerleşke') === yerleske);
    const floorNames = Array.from(new Set(campusRooms.map((r) => r.kogusNo || 'Kat'))).sort(floorSort);
    const campusFirma = emptyFirmaMap();

    const katlar: KampKatKroki[] = floorNames.map((kat) => {
      const rooms = campusRooms.filter((r) => (r.kogusNo || 'Kat') === kat).sort(roomSort);
      const floorFirma = emptyFirmaMap();
      let kapasite = 0;
      let dolu = 0;

      const odalar: KampOdaKrokiHucre[] = rooms.map((room) => {
        const stays = byRoom.get(room.id) || [];
        const roomFirma = emptyFirmaMap();
        const sakinler = stays.map((k) => {
          const firma = resolveKampYerlesimFirma(k, personeller);
          bumpFirma(roomFirma, firma, room.id);
          bumpFirma(floorFirma, firma, room.id);
          bumpFirma(campusFirma, firma, room.id);
          return {
            id: k.id,
            isim: k.personelIsim || 'İsimsiz',
            firma,
          };
        });
        const firmalar = toFirmaList(roomFirma);
        kapasite += Number(room.kapasite || 0);
        dolu += stays.length;
        return {
          room,
          dolu: stays.length,
          kapasite: Number(room.kapasite || 0),
          firmalar,
          dominantFirma: firmalar[0]?.firma || null,
          sakinler,
        };
      });

      return {
        yerleske,
        kat,
        odaSayisi: rooms.length,
        kapasite,
        dolu,
        firmalar: toFirmaList(floorFirma),
        odalar,
      };
    });

    return {
      yerleske,
      kapasite: katlar.reduce((s, k) => s + k.kapasite, 0),
      dolu: katlar.reduce((s, k) => s + k.dolu, 0),
      katlar,
      firmalar: toFirmaList(campusFirma),
    };
  });
}
