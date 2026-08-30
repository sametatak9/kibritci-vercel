export type KampKrokiPageFormat = 'A4' | 'A3';

const PAGE_SPECS: Record<
  KampKrokiPageFormat,
  { size: string; width: string; roomCols: number; roomGap: string }
> = {
  A4: { size: 'A4 landscape', width: '281mm', roomCols: 4, roomGap: '2.5mm' },
  A3: { size: 'A3 landscape', width: '400mm', roomCols: 5, roomGap: '3mm' },
};

export function buildKampKrokiPrintHtml(
  printContent: string,
  format: KampKrokiPageFormat = 'A4'
): string {
  const spec = PAGE_SPECS[format];

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kibritci_Insaat_Kamp_Krokisi_${format}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    @page {
      size: ${spec.size};
      margin: 8mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    body {
      display: flex;
      justify-content: center;
      padding: 8mm 0;
    }

    .kamp-print-shell {
      width: ${spec.width};
      max-width: ${spec.width} !important;
      min-width: ${spec.width};
      margin: 0 auto;
    }

    .kamp-print-shell .max-w-4xl,
    .kamp-print-shell .max-w-5xl,
    .kamp-print-shell .mx-auto {
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      width: 100% !important;
    }

    .kamp-kroki-room-grid {
      display: grid !important;
      grid-template-columns: repeat(${spec.roomCols}, minmax(0, 1fr)) !important;
      gap: ${spec.roomGap} !important;
      width: 100% !important;
    }

    .kamp-kroki-stats {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 3mm !important;
      width: 100% !important;
    }

    .kamp-kroki-signatures {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 4mm !important;
      width: 100% !important;
    }

    .kamp-campus-block,
    .kamp-floor-block {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }

    @media print {
      html, body {
        width: auto;
        height: auto;
        padding: 0 !important;
        overflow: visible;
      }

      body {
        display: block;
      }

      .kamp-print-shell {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
        transform: none !important;
        zoom: 1 !important;
      }

      .kamp-kroki-room-grid,
      .kamp-kroki-stats,
      .kamp-kroki-signatures {
        width: 100% !important;
      }

      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="kamp-print-shell">
    ${printContent}
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 400);
    };
  </script>
</body>
</html>`;
}

export function openKampKrokiPrintWindow(
  printContent: string,
  format: KampKrokiPageFormat = 'A4'
): void {
  const html = buildKampKrokiPrintHtml(printContent, format);
  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Kibritci_Kamp_Krokisi_${format}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
