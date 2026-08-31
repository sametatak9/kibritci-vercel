import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertTriangle } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export const ToastProvider: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail?.message || String(customEvent.detail);
      const displayMessage = /FIRESTORE_TIMEOUT/i.test(String(message))
        ? 'Bağlantı zaman aşımı. Ağınızı kontrol edip tekrar deneyin; yoklama büyük belgede tutulduğu için PC’de biraz sürebilir.'
        : message;
      const isError =
        displayMessage.toLowerCase().includes('hata') ||
        displayMessage.toLowerCase().includes('error') ||
        displayMessage.toLowerCase().includes('zaman aşımı') ||
        /FIRESTORE_TIMEOUT/i.test(String(message));
      const isSuccess = displayMessage.toLowerCase().includes('başarılı') || displayMessage.toLowerCase().includes('kaydedildi') || displayMessage.toLowerCase().includes('silindi');
      
      let type: 'info' | 'success' | 'warning' | 'error' = 'info';
      if (isError) type = 'error';
      else if (isSuccess) type = 'success';
      
      if (type === 'success') {
        window.dispatchEvent(new CustomEvent('app-confetti'));
      }
      
      const newToast: Toast = {
        id: Math.random().toString(36).substr(2, 9),
        message: displayMessage,
        type
      };

      setToasts(prev => [...prev, newToast]);

      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div 
          key={toast.id} 
          className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl border border-slate-700 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 animate-fade-in-up transform transition-all duration-300 hover:scale-105"
          style={{ animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
        >
          {toast.type === 'success' && <CheckCircle className="text-emerald-400 shrink-0 mt-0.5" size={18} />}
          {toast.type === 'error' && <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={18} />}
          {toast.type === 'info' && <Bell className="text-blue-400 shrink-0 mt-0.5" size={18} />}
          
          <div className="flex-1 text-[13px] font-medium leading-tight">
            {toast.message}
          </div>
          
          <button 
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
