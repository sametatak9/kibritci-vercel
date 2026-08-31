import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const siparis = resolve(dist, 'siparis.html');
const index = resolve(dist, 'index.html');

function fail(msg) {
  console.error(`[verify-siparis-dist] ${msg}`);
  process.exit(1);
}

if (!existsSync(index)) fail('dist/index.html yok — vite build çalışmadı');
if (!existsSync(siparis)) fail('dist/siparis.html yok — sipariş linki ERP girişine düşer');

const siparisHtml = readFileSync(siparis, 'utf8');
const indexHtml = readFileSync(index, 'utf8');

if (/My Google AI Studio App/i.test(indexHtml) || /My Google AI Studio App/i.test(siparisHtml)) {
  fail('Eski AI Studio HTML paketlenmiş; güncel index.html/siparis.html kullanılmamış');
}
if (!/Malzeme Siparişi|siparis/i.test(siparisHtml)) {
  fail('dist/siparis.html sipariş sayfası gibi görünmüyor');
}

console.log('[verify-siparis-dist] dist/siparis.html ve dist/index.html tamam');
