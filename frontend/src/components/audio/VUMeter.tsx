import { useEffect, useRef } from 'react';
import { useAudioMixerStore } from '@/store/audioMixerStore';

interface VUMeterProps {
  trackId: string;
  width?: number;
  height?: number;
}

export function VUMeter({ trackId, width = 16, height = 120 }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const peakRef = useRef(0);
  const peakDecayRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const engine = useAudioMixerStore.getState().engine;
      const level = engine?.getTrackLevel(trackId) ?? 0;

      // Peak hold with decay
      if (level > peakRef.current) {
        peakRef.current = level;
        peakDecayRef.current = 0;
      } else {
        peakDecayRef.current += 1;
        if (peakDecayRef.current > 30) {
          peakRef.current = Math.max(peakRef.current - 0.01, 0);
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const w = width * dpr;
      const h = height * dpr;
      canvas.width = w;
      canvas.height = h;

      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 2 * dpr);
      ctx.fill();

      // Level bar
      const barHeight = h * Math.min(level, 1);
      const barY = h - barHeight;

      // Create gradient: green -> yellow -> red
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#22c55e');    // green
      grad.addColorStop(0.6, '#22c55e');
      grad.addColorStop(0.75, '#eab308'); // yellow
      grad.addColorStop(0.9, '#ef4444');  // red
      grad.addColorStop(1, '#ef4444');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(2 * dpr, barY, w - 4 * dpr, barHeight, 1 * dpr);
      ctx.fill();

      // Peak indicator
      if (peakRef.current > 0.01) {
        const peakY = h - h * Math.min(peakRef.current, 1);
        ctx.fillStyle = peakRef.current > 0.9 ? '#ef4444' : '#ffffff';
        ctx.fillRect(2 * dpr, peakY, w - 4 * dpr, 2 * dpr);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [trackId, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="flex-shrink-0"
    />
  );
}
