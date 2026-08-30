/**
 * Compresses an image base64 data URL to ensure it is within Firestore's size limits.
 * @param base64Str The original base64 data URL of the image.
 * @param maxWidth The maximum width of the output image.
 * @param maxHeight The maximum height of the output image.
 * @param quality The compression quality (0.0 to 1.0).
 * @returns A Promise resolving to the compressed base64 data URL.
 */
export function compressImage(
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve) => {
    // If the base64 string is already very small (e.g., < 100KB), return it immediately to save time
    if (base64Str.length < 135000) {
      resolve(base64Str);
      return;
    }

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

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Str); // Fallback to original if canvas context is not available
        return;
      }

      // Draw the image onto the canvas
      ctx.drawImage(img, 0, 0, width, height);

      // We convert any loaded image type to image/jpeg for powerful compression
      let format = "image/jpeg";
      if (base64Str.includes("data:image/webp")) {
        format = "image/webp";
      }

      try {
        const compressedBase64 = canvas.toDataURL(format, quality);
        
        // Ensure the compressed result is actually smaller, otherwise use original
        if (compressedBase64.length < base64Str.length) {
          resolve(compressedBase64);
        } else {
          resolve(base64Str);
        }
      } catch (e) {
        resolve(base64Str); // Fallback on canvas error
      }
    };

    img.onerror = () => {
      resolve(base64Str); // Fallback on image load error
    };

    img.src = base64Str;
  });
}
