import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const require = createRequire(import.meta.url);
const handler = require(path.join(__dirname, '..', 'api', '[...path].js'));

const server = http.createServer((req, res) => {
  handler(req, res);
});

server.listen(3457, async () => {
  try {
    const r = await fetch('http://127.0.0.1:3457/api/gemini-health');
    const text = await r.text();
    console.log('handler type:', typeof handler);
    console.log('status', r.status);
    console.log(text.slice(0, 800));
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    server.close();
  }
});
