/**
 * Kaydedilen / e-posta HTML kasa raporlarında fiş fotoğrafı büyütme.
 * React ImageLightbox uygulamada; bu script standalone HTML için.
 */
export function getKasaFisLightboxHtmlSnippet(): string {
  return `
<style id="kasa-fis-lb-style">
  .kasa-fis-thumb-btn { cursor: zoom-in; }
  .kasa-fis-thumb-btn:hover { outline: 2px solid #0284c7; outline-offset: 2px; }
  #kasa-fis-lb {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0,0,0,.92);
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }
  #kasa-fis-lb.open { display: flex; }
  #kasa-fis-lb img {
    max-width: min(96vw, 1200px);
    max-height: 82vh;
    object-fit: contain;
    border-radius: 10px;
    box-shadow: 0 20px 50px rgba(0,0,0,.45);
    background: #fff;
  }
  #kasa-fis-lb .kasa-fis-lb-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  #kasa-fis-lb button, #kasa-fis-lb a {
    font: 700 12px/1 system-ui, sans-serif;
    padding: 10px 14px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    text-decoration: none;
    color: #fff;
  }
  #kasa-fis-lb .btn-close { background: #334155; }
  #kasa-fis-lb .btn-orig { background: #0284c7; }
  #kasa-fis-lb .btn-dl { background: #059669; }
  @media print {
    #kasa-fis-lb { display: none !important; }
  }
</style>
<div id="kasa-fis-lb" role="dialog" aria-modal="true" aria-label="Fiş büyütme">
  <img id="kasa-fis-lb-img" alt="Fiş orijinal" referrerpolicy="no-referrer" />
  <div class="kasa-fis-lb-bar">
    <a id="kasa-fis-lb-orig" class="btn-orig" href="#" target="_blank" rel="noopener noreferrer">Orijinali aç</a>
    <a id="kasa-fis-lb-dl" class="btn-dl" href="#" download="kasa-fis.jpg">İndir</a>
    <button type="button" class="btn-close" id="kasa-fis-lb-close">Kapat (Esc)</button>
  </div>
  <p style="color:#94a3b8;font:600 11px/1.4 system-ui,sans-serif;margin:0">Fotoğrafa veya dışarıya tıklayın · Esc ile kapatın</p>
</div>
<script id="kasa-fis-lb-script">
(function () {
  var lb = document.getElementById('kasa-fis-lb');
  var img = document.getElementById('kasa-fis-lb-img');
  var orig = document.getElementById('kasa-fis-lb-orig');
  var dl = document.getElementById('kasa-fis-lb-dl');
  var closeBtn = document.getElementById('kasa-fis-lb-close');
  if (!lb || !img) return;

  function openLb(url, title) {
    if (!url) return;
    img.src = url;
    img.alt = title || 'Fiş fotoğrafı';
    if (orig) { orig.href = url; orig.style.display = /^https?:/i.test(url) ? '' : 'none'; }
    if (dl) { dl.href = url; }
    lb.classList.add('open');
  }
  function closeLb() {
    lb.classList.remove('open');
    img.removeAttribute('src');
  }

  document.querySelectorAll('[data-kasa-fis]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openLb(el.getAttribute('data-kasa-fis'), el.getAttribute('data-kasa-fis-title') || '');
    });
  });

  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target === img) closeLb();
  });
  if (closeBtn) closeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    closeLb();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lb.classList.contains('open')) closeLb();
  });
})();
</script>`;
}
