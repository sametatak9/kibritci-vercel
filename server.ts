import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { registerApiRoutes } from "./src/server/registerApiRoutes";
import {
  isSiparisRequestPath,
  sendSiparisHtml,
  siparisPageMiddleware,
} from "./src/server/siparisPage";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerApiRoutes(app);

app.get("/api/public/siparis-health", (_req, res) => {
  res.json({
    ok: true,
    form: "/siparis.html",
    note: "Üyeliksiz sipariş — ERP oturumu yok, personel/yoklama yazılmaz",
  });
});

function siparisQueryRedirect(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/" && Object.prototype.hasOwnProperty.call(req.query, "siparis")) {
    return res.redirect(302, "/siparis.html");
  }
  return next();
}

app.use(siparisQueryRedirect);

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "mpa",
    });
    app.get(["/siparis", "/siparis/", "/siparis.html"], async (req, res, next) => {
      try {
        const htmlPath = path.resolve(process.cwd(), "siparis.html");
        const raw = fs.readFileSync(htmlPath, "utf-8");
        const html = await vite.transformIndexHtml("/siparis.html", raw);
        res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).end(html);
      } catch (err) {
        next(err);
      }
    });
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      if (isSiparisRequestPath(req.path)) {
        return next();
      }
      return vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");

    app.use((req, res, next) => {
      const normPath = req.path.toLowerCase();
      const isHtmlOrSwOrManifest =
        normPath === "/" ||
        isSiparisRequestPath(req.path) ||
        normPath.endsWith(".html") ||
        normPath === "/index.html" ||
        normPath === "/sw.js" ||
        normPath === "/manifest.json";
      if (isHtmlOrSwOrManifest) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      next();
    });

    // SPA fallback'den ÖNCE — /siparis asla index.html (giriş ekranı) olmasın
    app.use(siparisPageMiddleware(distPath));

    app.use(
      express.static(distPath, {
        maxAge: "1y",
        immutable: true,
        index: false,
      })
    );

    app.get("*", (req, res) => {
      if (isSiparisRequestPath(req.path)) {
        sendSiparisHtml(res, distPath);
        return;
      }
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
