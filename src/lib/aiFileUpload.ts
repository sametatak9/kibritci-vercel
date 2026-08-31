const MAX_IMAGE_DIM = 1600;
const JPEG_QUALITY = 0.82;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function compressImage(file: File): Promise<{ fileBase64: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return {
      fileBase64: arrayBufferToBase64(await file.arrayBuffer()),
      mimeType: file.type,
    };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Görsel sıkıştırılamadı'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });

  return {
    fileBase64: arrayBufferToBase64(await blob.arrayBuffer()),
    mimeType: 'image/jpeg',
  };
}

/** PDF veya görseli AI API için base64 payload'a dönüştürür (görseller sıkıştırılır). */
export async function fileToAiPayload(file: File): Promise<{ fileBase64: string; mimeType: string }> {
  if (file.type === 'application/pdf') {
    return {
      fileBase64: arrayBufferToBase64(await file.arrayBuffer()),
      mimeType: file.type,
    };
  }

  if (file.type.startsWith('image/')) {
    return compressImage(file);
  }

  return {
    fileBase64: arrayBufferToBase64(await file.arrayBuffer()),
    mimeType: file.type || 'application/octet-stream',
  };
}
