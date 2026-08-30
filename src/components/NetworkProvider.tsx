import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export const NetworkProvider: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      setTimeout(() => setShowRestored(false), 3000); // Hide restored message after 3 seconds
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showRestored) return null;

  return (
    <div className="fixed top-0 left-0 w-full z-[999999] flex justify-center pointer-events-none animate-fade-in-up">
      <div 
        className={`mt-2 px-4 py-2 rounded-full shadow-2xl flex items-center space-x-3 text-xs font-bold tracking-wide backdrop-blur-md border ${
          isOnline 
            ? 'bg-emerald-500/90 border-emerald-400 text-white' 
            : 'bg-amber-500/90 border-amber-400 text-white'
        }`}
      >
        {isOnline ? (
          <>
            <Wifi size={14} className="animate-pulse" />
            <span>Bağlantı Yeniden Kuruldu - Veriler Senkronize Ediliyor</span>
          </>
        ) : (
          <>
            <WifiOff size={14} className="animate-pulse" />
            <span>İnternet Bağlantısı Koptu - Verileriniz Cihazda Güvende</span>
          </>
        )}
      </div>
    </div>
  );
};
