import React, { useEffect, useState } from 'react';

export const KeyboardNavProvider: React.FC = () => {
  const [activeRow, setActiveRow] = useState<HTMLTableRowElement | null>(null);

  useEffect(() => {
    // Dinamik olarak tr tıklamalarını algıla ve aktif satırı belirle
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tr = target.closest('tr');
      
      // Remove class from old row
      if (activeRow && activeRow !== tr) {
        activeRow.classList.remove('row-focused');
      }

      if (tr && tr.parentElement?.tagName === 'TBODY') {
        tr.classList.add('row-focused');
        setActiveRow(tr);
      } else {
        setActiveRow(null);
      }
    };

    // Yön tuşlarını dinle
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeRow) return;

      // Sadece aşağı ve yukarı okları dinle
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); // Sayfanın kaymasını engelle
        
        const isDown = e.key === 'ArrowDown';
        const nextSibling = isDown ? activeRow.nextElementSibling : activeRow.previousElementSibling;

        if (nextSibling && nextSibling.tagName === 'TR') {
          // Eski seçiliden class'ı sil
          activeRow.classList.remove('row-focused');
          
          // Yeni seçiliye class ekle
          const nextTr = nextSibling as HTMLTableRowElement;
          nextTr.classList.add('row-focused');
          setActiveRow(nextTr);
          
          // Yeni satırı yumuşak bir şekilde ekrana kaydır
          nextTr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      if (activeRow) activeRow.classList.remove('row-focused');
    };
  }, [activeRow]);

  return null;
};
