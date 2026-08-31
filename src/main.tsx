import { Component, StrictMode, Suspense, type ReactNode } from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import { ToastProvider } from './components/ToastProvider';
import { SoundProvider } from './components/SoundProvider';
import { ContextMenuProvider } from './components/ContextMenuProvider';
import { KeyboardNavProvider } from './components/KeyboardNavProvider';
import { ConfettiProvider } from './components/ConfettiProvider';
import { EasterEggProvider } from './components/EasterEggProvider';
import { CommandPalette } from './components/CommandPalette';
import { NetworkProvider } from './components/NetworkProvider';

type RootErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : 'Bilinmeyen bir uygulama hatası oluştu.';
    return {
      hasError: true,
      message,
    };
  }

  componentDidCatch(error: unknown) {
    console.error('RootErrorBoundary:', error);
  }

  clearStorageAndReload = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // no-op
    }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // no-op
    }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // no-op
    }
    const url = new URL(window.location.href);
    url.searchParams.set('_reload', String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    if (!this.state.hasError) return (this as any).props.children;
    const looksLikeModuleInterop =
      /is not a constructor|is not a function|Cannot read propert/i.test(
        this.state.message || ''
      );
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: '620px', width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
          <h1 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Uygulama başlatılırken hata oluştu</h1>
          <p style={{ marginTop: '10px', color: '#475569', fontSize: '14px' }}>
            {looksLikeModuleInterop
              ? 'Bu hata genelde eski önbellek / karışık JS paketinden kaynaklanır. “Önbellek Temizle” ile yeniden açın.'
              : 'Sayfa boş görünüyorsa tarayıcı önbelleği veya eski oturum verisi kaynaklı olabilir.'}
          </p>
          <div style={{ marginTop: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#334155', wordBreak: 'break-word' }}>
            Teknik detay: {this.state.message || 'Hata mesajı alınamadı.'}
          </div>
          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ border: '1px solid #1d4ed8', background: '#2563eb', color: '#fff', borderRadius: '10px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}
            >
              Sayfayı Yenile
            </button>
            <button
              onClick={() => void this.clearStorageAndReload()}
              style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', borderRadius: '10px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}
            >
              Önbellek/Oturum Temizle ve Yeniden Aç
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** Tam ekran lazy paket yükleme göstergesi (tekil mobil ekranlar / public paylaşım görünümleri için) */
const FullScreenLoader = () => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 p-6 select-none">
    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ekran yükleniyor...</p>
  </div>
);

function isStandaloneSiparisPath(): boolean {
  const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
  if (path === '/siparis' || path.endsWith('/siparis.html')) return true;
  try {
    return new URLSearchParams(window.location.search).has('siparis');
  } catch {
    return false;
  }
}

async function boot() {
  if (isStandaloneSiparisPath()) {
    const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/index.html') {
      window.location.replace('/siparis.html');
      return;
    }
    await import('./siparis-main.tsx');
    return;
  }

  const { default: App } = await import('./App.tsx');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootErrorBoundary>
        <SoundProvider />
        <ContextMenuProvider />
        <KeyboardNavProvider />
        <ConfettiProvider />
        <EasterEggProvider />
        <ToastProvider />
        <NetworkProvider />
        <Suspense fallback={<FullScreenLoader />}>
          <App />
        </Suspense>
      </RootErrorBoundary>
    </StrictMode>,
  );
}

void boot();
