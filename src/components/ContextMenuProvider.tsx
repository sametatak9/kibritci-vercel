import React, { useState, useEffect } from 'react';
import { Copy, RefreshCw, XCircle, LayoutDashboard, Settings } from 'lucide-react';

export const ContextMenuProvider: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Prevent default browser menu
      e.preventDefault();
      
      // Calculate position so menu doesn't go off screen
      const menuWidth = 220;
      const menuHeight = 250;
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (x + menuWidth > window.innerWidth) x -= menuWidth;
      if (y + menuHeight > window.innerHeight) y -= menuHeight;
      
      setPosition({ x, y });
      setVisible(true);
    };

    const handleClick = () => {
      if (visible) setVisible(false);
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleClick);
    
    // Also close on scroll
    window.addEventListener('scroll', handleClick, true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleClick, true);
    };
  }, [visible]);

  if (!visible) return null;

  const handleAction = (action: string) => {
    setVisible(false);
    
    switch (action) {
      case 'reload':
        window.location.reload();
        break;
      case 'copy':
        // Try to copy selected text if any
        const selection = window.getSelection();
        if (selection && selection.toString()) {
          navigator.clipboard.writeText(selection.toString());
          window.alert("Kopyalandı: " + selection.toString().substring(0, 20) + "...");
        } else {
          window.alert("Kopyalanacak metin seçili değil.");
        }
        break;
      case 'darkmode':
        document.documentElement.classList.toggle('dark-mode');
        break;
    }
  };

  return (
    <div 
      className="fixed z-[99999] bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 shadow-2xl rounded-2xl w-56 overflow-hidden animate-fade-in text-white p-1.5"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 border-b border-slate-700/50 mb-1">
        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Kibritçi Menü</span>
      </div>
      
      <button 
        onClick={() => handleAction('copy')}
        className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl transition text-sm font-medium text-left"
      >
        <Copy size={14} className="text-slate-400" />
        <span>Seçimi Kopyala</span>
      </button>

      <button 
        onClick={() => handleAction('reload')}
        className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl transition text-sm font-medium text-left"
      >
        <RefreshCw size={14} className="text-blue-400" />
        <span>Sayfayı Yenile</span>
      </button>

      <div className="h-px bg-slate-700/50 my-1 mx-2"></div>

      <button 
        onClick={() => handleAction('darkmode')}
        className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl transition text-sm font-medium text-left"
      >
        <Settings size={14} className="text-amber-400" />
        <span>Gece Modu (Aç/Kapat)</span>
      </button>

      <button 
        onClick={() => setVisible(false)}
        className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-rose-500/20 text-rose-400 rounded-xl transition text-sm font-medium text-left mt-1"
      >
        <XCircle size={14} />
        <span>Kapat</span>
      </button>
    </div>
  );
};
