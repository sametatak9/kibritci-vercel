/**
 * Akvizyon grup nöbeti — akşam 21:00 (Europe/Istanbul) otomatik kapanış.
 * Render Cron veya harici zamanlayıcıdan çağrılır.
 *
 *   CRON_SECRET=... node scripts/cron-akvizyon-nobet.mjs
 *   # veya HTTP:
 *   curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://.../api/cron/akvizyon-nobet-kapat
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const baseUrl =
  args.find((a) => a.startsWith('--url='))?.slice(6) ||
  process.env.APP_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  'https://kibritci-erp.onrender.com';

const secret =
  process.env.CRON_SECRET ||
  (() => {
    const envPath = resolve('.env.local');
    if (!existsSync(envPath)) return '';
    const match = readFileSync(envPath, 'utf8').match(/^CRON_SECRET=(.+)$/m);
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
  })();

if (!secret) {
  console.error('CRON_SECRET tanımlı değil.');
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, '')}/api/cron/akvizyon-nobet-kapat`;
console.log('POST', url);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Cron-Secret': secret,
  },
  body: JSON.stringify({}),
});

const text = await res.text();
console.log('Status:', res.status);
console.log(text);
if (!res.ok) process.exit(1);
