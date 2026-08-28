import React from 'react';

interface KibritciLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const KibritciLogo: React.FC<KibritciLogoProps> = ({ 
  className = '', 
  size = 'md',
  showText = true 
}) => {
  const sizes = {
    sm: 'h-6',
    md: 'h-10',
    lg: 'h-14',
    xl: 'h-20'
  };

  const heightClass = className.includes('h-') ? '' : sizes[size];

  return (
    <div className={`flex items-center space-x-2 select-none shrink-0 ${heightClass} ${className}`}>
      {/* Elegant Architectural K-shaped SVG Logo */}
      <svg 
        viewBox="0 0 140 120" 
        className="h-full w-auto" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Frame boundary grid */}
        <rect x="5" y="5" width="110" height="110" rx="10" stroke="#1E4E78" strokeWidth="3" />
        
        {/* Left tall building - red */}
        <path d="M15 115 V75 L35 50 V115" fill="#8B1E1E" />
        
        {/* Middle taller building - crimson */}
        <path d="M35 115 V52 L58 30 V115" fill="#B91C1C" />
        
        {/* Diagonal extension of building representing the K wing */}
        <path d="M58 52 L95 90 H72 L45 61 Z" fill="#8B1E1E" />
        <path d="M58 85 L95 115 H72 L58 100 Z" fill="#1E4E78" />
        
        {/* Grid lines detail */}
        <line x1="15" y1="115" x2="115" y2="115" stroke="#1E4E78" strokeWidth="4" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-[#1E4E78] font-black tracking-wider text-xs sm:text-sm">
            KİBRİTÇİ
          </span>
          <span className="text-[#8B1E1E] font-black tracking-widest text-[8px] sm:text-[9px] mt-0.5">
            İNŞAAT
          </span>
        </div>
      )}
    </div>
  );
};

export default KibritciLogo;
