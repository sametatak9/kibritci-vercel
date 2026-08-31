/** ExcelJS CJS/ESM uyumlu yükleyici — başlangıç paketinden çıkarır. */

type ExcelLike = {
  Workbook: new () => import('exceljs').Workbook;
};

function resolveExcelModule(mod: any): ExcelLike {
  const candidates = [mod, mod?.default, mod?.default?.default];
  for (const c of candidates) {
    if (c && typeof c.Workbook === 'function') {
      return c as ExcelLike;
    }
  }
  throw new Error(
    'ExcelJS.Workbook yüklenemedi (modül uyumsuzluğu). Sayfayı sert yenileyin veya önbelleği temizleyin.'
  );
}

let cached: Promise<ExcelLike> | null = null;

export function loadExcelJS(): Promise<ExcelLike> {
  if (!cached) {
    cached = import('exceljs')
      .then((mod) => resolveExcelModule(mod))
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

export async function createExcelWorkbook(): Promise<import('exceljs').Workbook> {
  const ExcelJS = await loadExcelJS();
  return new ExcelJS.Workbook();
}
