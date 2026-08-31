import express from 'express';
import { registerApiRoutes } from '../src/server/registerApiRoutes';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
registerApiRoutes(app);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverlessHttp = require('serverless-http');
const slsHandler =
  typeof serverlessHttp === 'function'
    ? serverlessHttp(app, {
        binary: ['image/*', 'application/pdf', 'application/octet-stream'],
      })
    : serverlessHttp.default(app, {
        binary: ['image/*', 'application/pdf', 'application/octet-stream'],
      });

async function vercelHandler(
  req: express.Request,
  res: express.Response
): Promise<unknown> {
  try {
    return await slsHandler(req, res);
  } catch (err: unknown) {
    console.error('Vercel API crash:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: message });
    }
  }
}

const vercelConfig = {
  api: { bodyParser: false as const },
  maxDuration: 60,
};

// CJS export — root package.json "type":"module" api/ klasöründe api/package.json ile override edilir
module.exports = vercelHandler;
module.exports.config = vercelConfig;
