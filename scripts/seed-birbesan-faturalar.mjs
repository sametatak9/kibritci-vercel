#!/usr/bin/env node
/**
 * BİRBESAN 2 Excel tablosunu fatura + stok kartı olarak Firestore'a yazar.
 * Mevcut fatura/stok hareketleri korunur (idempotent).
 *
 *   node scripts/seed-birbesan-faturalar.mjs --dry-run
 *   node scripts/seed-birbesan-faturalar.mjs --execute
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, setDoc } from 'firebase/firestore';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const dryRun = !execute;

const normalizeText = (raw) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim();

const canonicalStokKey = (raw) =>
  normalizeText(raw)
    .replace(/\s*\.\s*/g, '.')
    .replace(/(\d)\s+mm\b/g, '$1mm')
    .replace(/\(\s*n\s*\)/g, '(n)')
    .trim();

const stableFaturaId = (cariId, belgeNo) => {
  const slug = normalizeText(belgeNo).replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  return `fat_${cariId}_${slug}`;
};

const stableStokIslemId = (faturaId, stokId, rowKey) =>
  `stk_islem_${faturaId}_${stokId}_${normalizeText(rowKey).replace(/[^a-z0-9]+/g, '_').slice(0, 24)}`;

const dataPath = resolve('data/birbesan/birbesan-faturalar.json');
if (!existsSync(dataPath)) {
  console.error('Dosya yok:', dataPath);
  process.exit(1);
}
const { faturalar: plans } = JSON.parse(readFileSync(dataPath, 'utf8'));

const configPath = resolve('firebase-target.config.json');
if (!existsSync(configPath)) {
  console.error('firebase-target.config.json bulunamadı');
  process.exit(1);
}

const firebaseCfg = JSON.parse(readFileSync(configPath, 'utf8'));
const app = initializeApp(
  {
    apiKey: firebaseCfg.apiKey,
    authDomain: firebaseCfg.authDomain,
    projectId: firebaseCfg.projectId,
    storageBucket: firebaseCfg.storageBucket,
    messagingSenderId: firebaseCfg.messagingSenderId,
    appId: firebaseCfg.appId,
  },
  `BIRBESAN_FAT_${Date.now()}`
);
const db = getFirestore(app);

const [stokSnap, cariSnap, faturaSnap, cariIslemSnap, stokIslemSnap] = await Promise.all([
  getDocs(collection(db, 'stokKartlar')),
  getDocs(collection(db, 'cariKartlar')),
  getDocs(collection(db, 'faturalar')),
  getDocs(collection(db, 'cariIslemGecmisi')),
  getDocs(collection(db, 'stokIslemGecmisi')),
]);

const stoklar = stokSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const cariler = cariSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const faturalar = faturaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const cariIslemler = cariIslemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const stokIslemler = stokIslemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

let cari = cariler.find((c) => normalizeText(c.unvan).includes('birbesan'));
if (!cari && execute) {
  cari = {
    id: `c_${Date.now()}`,
    kartTipi: 'TEDARIKCI',
    kod: `CARI-${Math.floor(100 + Math.random() * 900)}`,
    unvan: 'BİRBESAN',
    durum: 'AKTIF',
    notlar: 'BİRBESAN fatura seed.',
  };
  await setDoc(doc(db, 'cariKartlar', cari.id), cari);
}

const isBirbesanStok = (s) =>
  Boolean(s.arsivde) &&
  (s.stokKaynak === 'BIRBESAN_EXCEL' || normalizeText(s.tedarikciUnvan || '').includes('birbesan'));

const findStok = (urunAdi) => {
  const key = canonicalStokKey(urunAdi);
  return stoklar.find((s) => isBirbesanStok(s) && canonicalStokKey(s.stokAdi) === key) || null;
};

const allKalemler = plans.flatMap((p) => p.kalemler);
const merged = new Map();
for (const k of allKalemler) {
  const key = canonicalStokKey(k.urunAdi);
  const prev = merged.get(key);
  if (!prev) merged.set(key, { ...k });
  else prev.miktar += k.miktar;
}

let createdStok = 0;
let updatedStok = 0;
const stokIdByNorm = new Map();

for (const [key, meta] of merged.entries()) {
  let stok = findStok(meta.urunAdi);
  const history = stok ? stokIslemler.filter((i) => i.stokKartId === stok.id) : [];
  if (!stok) {
    console.log(`YENİ STOK: ${meta.urunAdi} → ${meta.miktar} ${meta.birim}`);
    if (execute) {
      stok = {
        id: `sk_birbesan_${key.slice(0, 20).replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
        stokKodu: `BB-${String(createdStok + 1).padStart(3, '0')}`,
        stokAdi: meta.urunAdi,
        kategori: 'BİRBESAN Arşiv',
        birim: meta.birim,
        miktar: meta.miktar,
        kritikSeviye: 0,
        durum: 'AKTIF',
        arsivde: true,
        stokKaynak: 'BIRBESAN_EXCEL',
        tedarikciCariId: cari?.id,
        tedarikciUnvan: cari?.unvan || 'BİRBESAN',
        aciklama: `BİRBESAN 2 Excel fatura kataloğu. Toplam: ${meta.miktar} ${meta.birim}.`,
      };
      await setDoc(doc(db, 'stokKartlar', stok.id), stok);
      stoklar.push(stok);
    }
    createdStok += 1;
  } else {
    const nextMiktar = history.length > 0 ? Math.max(Number(stok.miktar || 0), meta.miktar) : meta.miktar;
    console.log(`GÜNCELLE STOK: ${meta.urunAdi} → ${nextMiktar} ${meta.birim}${history.length ? ' (geçmiş korundu)' : ''}`);
    if (execute) {
      const next = {
        ...stok,
        miktar: nextMiktar,
        arsivde: true,
        stokKaynak: 'BIRBESAN_EXCEL',
        tedarikciCariId: cari?.id || stok.tedarikciCariId,
        tedarikciUnvan: cari?.unvan || 'BİRBESAN',
        kategori: 'BİRBESAN Arşiv',
      };
      await setDoc(doc(db, 'stokKartlar', stok.id), next);
      Object.assign(stok, next);
    }
    updatedStok += 1;
  }
  if (stok) stokIdByNorm.set(key, stok.id);
}

let createdFatura = 0;
let skippedFatura = 0;
let createdStokIslem = 0;
let skippedStokIslem = 0;

for (const plan of plans) {
  const exists = faturalar.find(
    (f) => f.cariKartId === cari?.id && normalizeText(f.faturaNo) === normalizeText(plan.faturaNo)
  );
  if (exists) {
    console.log(`ATLA FATURA: ${plan.faturaNo} (zaten var)`);
    skippedFatura += 1;
    continue;
  }

  const faturaId = stableFaturaId(cari.id, plan.faturaNo);
  const kalemler = plan.kalemler.map((line, idx) => ({
    id: `fi_${faturaId}_${idx}`,
    urunAdi: line.urunAdi,
    miktar: line.miktar,
    birim: line.birim,
    birimFiyat: line.birimFiyat || 0,
    kdvOran: 20,
    toplam: (line.birimFiyat || 0) * line.miktar,
    stokKartId: stokIdByNorm.get(canonicalStokKey(line.urunAdi)),
  }));
  const toplamTutar = kalemler.reduce((s, k) => s + (k.toplam || 0), 0);
  const kdvTutar = Math.round(toplamTutar * 0.2 * 100) / 100;

  console.log(`FATURA: ${plan.faturaNo} → ${kalemler.length} kalem, ₺${toplamTutar + kdvTutar}`);

  if (execute) {
    await setDoc(doc(db, 'faturalar', faturaId), {
      id: faturaId,
      faturaNo: plan.faturaNo,
      tarih: plan.tarih,
      cariKartId: cari.id,
      cariUnvan: cari.unvan,
      toplamTutar,
      kdvTutar,
      genelToplam: toplamTutar + kdvTutar,
      durum: 'ONAYLANDI',
      rapor: plan.aciklama || 'BİRBESAN Excel fatura',
      kalemler,
      bagliIrsaliyeler: [],
      eImzalar: [],
    });

    const cariIslemId = `cari_islem_${faturaId}`;
    if (!cariIslemler.some((i) => i.id === cariIslemId)) {
      await setDoc(doc(db, 'cariIslemGecmisi', cariIslemId), {
        id: cariIslemId,
        cariKartId: cari.id,
        islemTipi: 'FATURA',
        islemId: faturaId,
        islemBaslik: `Fatura ${plan.faturaNo}`,
        islemDetay: `${kalemler.length} kalem · BİRBESAN Excel`,
        tutar: toplamTutar + kdvTutar,
        tarih: plan.tarih,
        belgeNo: plan.faturaNo,
      });
    }

    for (const [idx, line] of plan.kalemler.entries()) {
      const stokId = stokIdByNorm.get(canonicalStokKey(line.urunAdi));
      if (!stokId) continue;
      const stokIslemId = stableStokIslemId(faturaId, stokId, `${idx}-${line.urunAdi}`);
      if (stokIslemler.some((i) => i.id === stokIslemId)) {
        skippedStokIslem += 1;
        continue;
      }
      await setDoc(doc(db, 'stokIslemGecmisi', stokIslemId), {
        id: stokIslemId,
        stokKartId: stokId,
        islemTipi: 'GIRIS',
        islemId: faturaId,
        islemBaslik: `BİRBESAN fatura ${plan.faturaNo}`,
        islemDetay: `${line.urunAdi} · ${line.miktar} ${line.birim}`,
        miktarDegisimi: line.miktar,
        tarih: plan.tarih,
        belgeNo: plan.faturaNo,
      });
      createdStokIslem += 1;
    }
  }
  createdFatura += 1;
}

console.log('--- ÖZET ---');
console.log(`Mod: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
console.log(`Fatura planı: ${plans.length}`);
console.log(`Stok yeni: ${createdStok}, güncellenen: ${updatedStok}`);
console.log(`Fatura yeni: ${createdFatura}, atlanan: ${skippedFatura}`);
console.log(`Stok hareketi yeni: ${createdStokIslem}, atlanan: ${skippedStokIslem}`);
