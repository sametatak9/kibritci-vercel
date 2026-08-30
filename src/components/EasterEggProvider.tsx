import React, { useEffect, useState, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';

export const EasterEggProvider: React.FC = () => {
  const [active, setActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const handleTrigger = () => {
      setActive(true);
      // Play a futuristic activation sound
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 1);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.5);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 2);
      } catch (e) {}

      // Auto close after 8 seconds
      setTimeout(() => {
        setActive(false);
      }, 8000);
    };

    window.addEventListener('app-easter-egg', handleTrigger);
    return () => window.removeEventListener('app-easter-egg', handleTrigger);
  }, []);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const letters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$+-*/=%""\'#&_(),.;:?!\\|{}<>[]^~';
    const alphabet = letters.split('');
    const fontSize = 16;
    const columns = canvas.width / fontSize;
    const drops: number[] = [];

    for (let x = 0; x < columns; x++) {
      drops[x] = 1;
    }

    const draw = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#10b981'; // emerald-500
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = alphabet[Math.floor(Math.random() * alphabet.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 33);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-slate-900 flex items-center justify-center overflow-hidden animate-fade-in">
      <canvas ref={canvasRef} className="absolute inset-0 opacity-80"></canvas>
      
      <div className="relative z-10 bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.3)] text-center max-w-md transform transition-all duration-1000 scale-100 animate-fade-in-up">
        <ShieldAlert size={48} className="text-emerald-500 mx-auto mb-6 animate-pulse" />
        <h2 className="text-2xl font-black text-emerald-400 tracking-widest mb-2 uppercase font-mono">
          System Override
        </h2>
        <p className="text-emerald-500/70 font-mono text-xs leading-relaxed mb-6">
          "The matrix is everywhere. It is all around us. Even now, in this very room."
          <br /><br />
          Tebrikler. Süper Geliştirici Modu (Easter Egg) kilidini açtınız.
        </p>
        <div className="inline-block border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 rounded-lg text-emerald-400 font-bold text-[10px] tracking-widest animate-pulse">
          TIER-1 YAZILIM ALTYAPISI AKTİF
        </div>
      </div>
    </div>
  );
};
