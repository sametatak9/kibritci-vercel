import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { SiparisFormuScreen } from './components/SiparisFormuScreen';

/** Bu sayfa ERP App.tsx'i hiç yüklemez — üyeliksiz sipariş linki. */
document.title = 'Kibritçi · Malzeme Siparişi';
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => {
      void r.unregister();
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiparisFormuScreen
      isPublic
      onClose={() => {
        window.location.assign(`${window.location.origin}/`);
      }}
    />
  </StrictMode>
);
