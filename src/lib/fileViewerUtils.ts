/**
 * Safely opens a data URL (base64) in a new tab by converting it to a Blob object URL
 * or rendering it inside a custom document context, bypassing browser security blocks
 * against top-level data URI navigations.
 */
export function openBase64InNewTab(dataUrl: string, fileName = 'Belge') {
  if (!dataUrl) return;
  if (!dataUrl.startsWith('data:')) {
    // If it's a normal http/https URL, open it normally
    window.open(dataUrl, '_blank');
    return;
  }

  try {
    // Parse mime type
    const parts = dataUrl.split(',');
    const header = parts[0];
    const mime = header.split(';')[0].split(':')[1];
    const base64Data = parts[1];

    if (mime.startsWith('image/')) {
      // For images, we open a new tab and write HTML to render it beautifully centered on a dark theme
      const win = window.open();
      if (win) {
        win.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${fileName}</title>
              <style>
                body { margin: 0; display: flex; justify-content: center; align-items: center; background-color: #0f172a; min-height: 100vh; font-family: system-ui, sans-serif; overflow: hidden; }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); user-select: none; }
              </style>
            </head>
            <body>
              <img src="${dataUrl}" alt="${fileName}" />
            </body>
          </html>
        `);
        win.document.close();
        return;
      }
    }

    // For PDFs, Word documents or other formats, convert to blob URL for sandbox security clearance
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    const win = window.open(blobUrl, '_blank');
    if (!win) {
      // Popup blocked fallback: download immediately
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.click();
    }
  } catch (err) {
    console.error('Failed to open document:', err);
    // Ultimate fallback: iframe source injection
    const win = window.open();
    if (win) {
      win.document.write(`<iframe src="${dataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
      win.document.close();
    }
  }
}
