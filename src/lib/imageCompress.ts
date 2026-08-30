/**
 * Compresses an image base64 data URL to ensure it is within Firestore's size limits.
 * @param base64Str The original base64 data URL of the image.
 * @param maxWidth The maximum width of the output image.
 * @param maxHeight The maximum height of the output image.
 * @param quality The compression quality (0.0 to 1.0).
 * @param timeoutMs Image decode/canvas zaman aşımı — asılırsa orijinal döner.
 * @returns A Promise resolving to the compressed base64 data URL.
 */
export function compressImage(
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7,
  timeoutMs = 5000
): Promise<string> {
  return new Promise((resolve) => {
    // If the base64 string is already very small (e.g., < 100KB), return it immediately to save time
    if (base64Str.length < 135000) {
      resolve(base64Str);
      return;
    }

    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      // Image.onload hiç gelmezse gönderim sonsuza asılıyordu
      finish(base64Str);
    }, Math.max(1000, timeoutMs));

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      let format = 'image/jpeg';
      if (base64Str.includes('data:image/webp')) {
        format = 'image/webp';
      }

      try {
        const compressedBase64 = canvas.toDataURL(format, quality);
        finish(compressedBase64.length < base64Str.length ? compressedBase64 : base64Str);
      } catch {
        finish(base64Str);
      }
    };

    img.onerror = () => {
      finish(base64Str);
    };

    try {
      img.src = base64Str;
    } catch {
      finish(base64Str);
    }
  });
}
