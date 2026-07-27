#!/usr/bin/env node
/**
 * BİRBESAN stok kataloğunu (birleştirilmiş 31 kalem) Firestore'a yazar.
 * Mükerrer kartları canonical isimle birleştirir.
 *
 *   node scripts/seed-birbesan-stok-catalog.mjs --dry-run
 *   node scripts/seed-birbesan-stok-catalog.mjs --execute
 *   node scripts/seed-birbesan-stok-catalog.mjs --execute --dedupe-only
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { collection, deleteDoc, doc, getDocs, getFirestore, setDoc } from 'firebase/firestore';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const dryRun = !execute;
const dedupeOnly = args.includes('--dedupe-only');

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
    .replace(/\s+/g, ' ')
    .trim();

const isBirbesanStok = (s) =>
  Boolean(s.arsivde) &&
  (s.stokKaynak === 'BIRBESAN_EXCEL' || normalizeText(s.tedarikciUnvan || '').includes('birbesan'));

const catalogPath = resolve('data/birbesan/birbesan-stok-catalog.json');
if (!existsSync(catalogPath)) {
  console.error('Katalog dosyası yok:', catalogPath);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

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
  `BIRBESAN_SEED_${Date.now()}`
);
const db = getFirestore(app);

const [stokSnap, cariSnap] = await Promise.all([
  getDocs(collection(db, 'stokKartlar')),
  getDocs(collection(db, 'cariKartlar')),
]);

const stoklar = stokSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const cariler = cariSnap.docs.map((d) => d.data());
let cari = cariler.find((c) => normalizeText(c.unvan).includes('birbesan'));
if (!cari && execute) {
  cari = {
    id: `c_${Date.now()}`,
    kartTipi: 'TEDARIKCI',
    kod: `CARI-${Math.floor(100 + Math.random() * 900)}`,
    unvan: 'BİRBESAN',
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: '',
    iban: '',
    durum: 'AKTIF',
    notlar: 'BİRBESAN stok kataloğu seed.',
  };
  await setDoc(doc(db, 'cariKartlar', cari.id), cari);
  console.log('BİRBESAN cari oluşturuldu:', cari.id);
}

const birbesanPool = stoklar.filter(isBirbesanStok);
const byKey = new Map();
for (const s of birbesanPool) {
  const key = canonicalStokKey(s.stokAdi);
  const bucket = byKey.get(key) || [];
  bucket.push(s);
  byKey.set(key, bucket);
}

let deduped = 0;
let deleted = 0;
for (const [key, group] of byKey.entries()) {
  if (group.length <= 1) continue;
  group.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const keeper = group[0];
  const totalMiktar = group.reduce((sum, x) => sum + Number(x.miktar || 0), 0);
  const longestName = group.reduce((best, x) => (String(x.stokAdi).length > best.length ? String(x.stokAdi) : best), keeper.stokAdi);
  console.log(`MÜKERRER: ${longestName} → ${group.length} kart, toplam miktar: ${totalMiktar}`);
  if (execute) {
    const merged = {
      ...keeper,
      stokAdi: longestName,
      miktar: totalMiktar,
      arsivde: true,
      stokKaynak: 'BIRBESAN_EXCEL',
      kategori: 'BİRBESAN Arşiv',
      tedarikciCariId: cari?.id || keeper.tedarikciCariId,
      tedarikciUnvan: cari?.unvan || keeper.tedarikciUnvan || 'BİRBESAN',
    };
    await setDoc(doc(db, 'stokKartlar', keeper.id), merged);
    for (let i = 1; i < group.length; i++) {
      await deleteDoc(doc(db, 'stokKartlar', group[i].id));
      deleted += 1;
    }
    deduped += 1;
  }
}

if (dedupeOnly) {
  console.log(`Mod: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`Birleştirilen grup: ${deduped}, silinen mükerrer: ${deleted}`);
  process.exit(0);
}

let created = 0;
let updated = 0;
for (const item of catalog) {
  const key = canonicalStokKey(item.urunAdi);
  const existing = stoklar.find((s) => isBirbesanStok(s) && canonicalStokKey(s.stokAdi) === key);
  if (existing) {
    console.log(`GÜNCELLE: ${item.urunAdi} → ${item.miktar} ${item.birim}`);
    if (execute) {
      await setDoc(doc(db, 'stokKartlar', existing.id), {
        ...existing,
        stokAdi: item.urunAdi,
        miktar: item.miktar,
        birim: item.birim,
        arsivde: true,
        stokKaynak: 'BIRBESAN_EXCEL',
        kategori: 'BİRBESAN Arşiv',
        tedarikciCariId: cari?.id || existing.tedarikciCariId,
        tedarikciUnvan: cari?.unvan || 'BİRBESAN',
        aciklama: `BİRBESAN katalog (2 Excel birleşik). Toplam: ${item.miktar} ${item.birim}.`,
      });
    }
    updated += 1;
    continue;
  }
  console.log(`YENİ: ${item.urunAdi} → ${item.miktar} ${item.birim}`);
  if (execute) {
    const id = `sk_birbesan_${key.slice(0, 24).replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    await setDoc(doc(db, 'stokKartlar', id), {
      id,
      stokKodu: `BB-${String(created + 1).padStart(3, '0')}`,
      stokAdi: item.urunAdi,
      kategori: 'BİRBESAN Arşiv',
      birim: item.birim,
      miktar: item.miktar,
      kritikSeviye: 0,
      durum: 'AKTIF',
      aciklama: `BİRBESAN katalog (2 Excel birleşik). Toplam: ${item.miktar} ${item.birim}.`,
      arsivde: true,
      stokKaynak: 'BIRBESAN_EXCEL',
      tedarikciCariId: cari?.id,
      tedarikciUnvan: cari?.unvan || 'BİRBESAN',
    });
  }
  created += 1;
}

console.log('--- ÖZET ---');
console.log(`Mod: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
console.log(`Katalog kalem: ${catalog.length}`);
console.log(`Yeni: ${created}, Güncellenen: ${updated}`);
console.log(`Mükerrer birleştirilen grup: ${deduped}, silinen: ${deleted}`);
