import { useCallback, useRef } from 'react';

interface PanKnobProps {
  value: number; // -1 to 1
  onChange: (value: number) => void;
  size?: number;
}

export function PanKnob({ value, onChange, size = 32 }: PanKnobProps) {
  const knobRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startValueRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      startYRef.current = e.clientY;
      startValueRef.current = value;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const deltaY = startYRef.current - ev.clientY;
        const sensitivity = 0.01;
        const newVal = Math.max(-1, Math.min(1, startValueRef.current + deltaY * sensitivity));
        onChange(Math.round(newVal * 100) / 100);
      };

      const handleMouseUp = () => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [value, onChange],
  );

  // Map -1..1 to rotation angle (-135° to 135°)
  const angle = value * 135;
  const r = size / 2;
  const label = value === 0 ? 'C' : value < 0 ? `L${Math.round(Math.abs(value) * 100)}` : `R${Math.round(value * 100)}`;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg
        ref={knobRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="cursor-ns-resize"
        onMouseDown={handleMouseDown}
      >
        {/* Outer ring */}
        <circle
          cx={r}
          cy={r}
          r={r - 2}
          fill="var(--color-surface)"
          stroke="var(--color-border)"
          strokeWidth={1.5}
        />
        {/* Inner fill */}
        <circle
          cx={r}
          cy={r}
          r={r - 5}
          fill="var(--color-bg)"
        />
        {/* Indicator line */}
        <line
          x1={r}
          y1={r}
          x2={r + (r - 5) * Math.sin((angle * Math.PI) / 180)}
          y2={r - (r - 5) * Math.cos((angle * Math.PI) / 180)}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={r} cy={r} r={2} fill="var(--accent)" />
      </svg>
      <span className="text-[9px] text-[var(--color-text-secondary)] select-none">
        {label}
      </span>
    </div>
  );
}
