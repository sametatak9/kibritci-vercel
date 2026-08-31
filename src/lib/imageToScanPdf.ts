/** Fotoğrafı taranmış belge görünümlü tek sayfalık PDF data URL'e dönüştürür. */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel yüklenemedi'));
    img.src = src;
  });
}

/** Hafif gri ton + kontrast — taranmış belge hissi */
function enhanceScanCanvas(
  img: HTMLImageElement,
  maxEdge = 1200
): { canvas: HTMLCanvasElement; width: number; height: number } {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (Math.max(w, h) > maxEdge) {
    const scale = maxEdge / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');

  ctx.fillStyle = '#f8f8f6';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.15 + 128));
    d[i] = boosted;
    d[i + 1] = boosted;
    d[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);
  return { canvas, width: w, height: h };
}

export async function convertImageToScanPdfDataUrl(imageDataUrl: string): Promise<string> {
  const raw = String(imageDataUrl || '').trim();
  if (!raw.startsWith('data:image/')) {
    throw new Error('Yalnızca görsel dosyalar PDF taramaya dönüştürülebilir');
  }

  const img = await loadImage(raw);
  const { canvas, width, height } = enhanceScanCanvas(img);
  const jpegData = canvas.toDataURL('image/jpeg', 0.82);

  const { jsPDF } = await import('jspdf');
  const orientation = width >= height ? 'l' : 'p';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const ratio = Math.min(availW / width, availH / height);
  const drawW = width * ratio;
  const drawH = height * ratio;
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;

  doc.addImage(jpegData, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
  return doc.output('datauristring');
}

export function isPdfDataUrl(url: string): boolean {
  return String(url || '').trim().startsWith('data:application/pdf');
}
