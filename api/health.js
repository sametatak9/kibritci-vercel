/** Lightweight Vercel health check — does not load Express or Firebase. */
module.exports = function health(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'kibritci_web',
    host: 'vercel',
    firebase: 'kibritci-erp',
  });
};
