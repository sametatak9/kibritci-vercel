import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  velocity: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
}

export const ConfettiProvider: React.FC = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const handleConfetti = () => {
      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];
      const newParticles: Particle[] = [];
      
      // Create 40 particles originating from bottom center-ish
      for (let i = 0; i < 40; i++) {
        newParticles.push({
          id: Math.random(),
          x: window.innerWidth / 2,
          y: window.innerHeight,
          color: colors[Math.floor(Math.random() * colors.length)],
          angle: Math.random() * Math.PI + Math.PI, // Shoot upwards (180 to 360 deg)
          velocity: 15 + Math.random() * 25,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 20,
          size: 6 + Math.random() * 8
        });
      }
      
      setParticles(newParticles);
    };

    window.addEventListener('app-confetti', handleConfetti);
    return () => window.removeEventListener('app-confetti', handleConfetti);
  }, []);

  useEffect(() => {
    if (particles.length === 0) return;

    let animationFrameId: number;
    let currentParticles = [...particles];

    const animate = () => {
      currentParticles = currentParticles.map(p => {
        // Physics update
        p.velocity *= 0.95; // friction
        p.x += Math.cos(p.angle) * p.velocity;
        p.y += Math.sin(p.angle) * p.velocity + 3; // +3 is gravity
        p.rotation += p.rotationSpeed;
        return p;
      }).filter(p => p.y < window.innerHeight + 100); // Remove when off screen

      setParticles(currentParticles);

      if (currentParticles.length > 0) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [particles.length > 0]); // Only re-run if we have particles

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[999999] overflow-hidden">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
            opacity: p.y > window.innerHeight - 100 ? 1 - (p.y - (window.innerHeight - 100))/100 : 1 // fade out at bottom
          }}
        />
      ))}
    </div>
  );
};
