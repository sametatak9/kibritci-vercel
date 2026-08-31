import React, { useEffect } from 'react';
import { playClickSound, playSuccessSound, playErrorSound } from '../lib/soundUtils';

export const SoundProvider: React.FC = () => {
  useEffect(() => {
    // Dinamik tıklama (click) sesleri için global listener
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Sadece interaktif öğelere (butonlar, linkler vb) tıklandığında ses çalsın
      if (
        target.closest('button') || 
        target.closest('a') || 
        target.closest('.cursor-pointer') || 
        target.closest('[role="button"]')
      ) {
        playClickSound();
      }
    };

    // Toast bildirimleri geldiğinde başarı/hata sesleri
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail?.message || String(customEvent.detail);
      const isError = message.toLowerCase().includes('hata') || message.toLowerCase().includes('error');
      
      if (isError) {
        playErrorSound();
      } else {
        playSuccessSound();
      }
    };

    window.addEventListener('click', handleClick, true); // true = capture phase for immediate response
    window.addEventListener('app-toast', handleToast);

    return () => {
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('app-toast', handleToast);
    };
  }, []);

  return null; // Arayüzde hiçbir şey render etmez, tamamen arkaplan servisidir.
};
