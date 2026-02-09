import { useRef, useEffect, useCallback, useState } from 'react';
import { useMotionTrackingStore } from '@/store/motionTrackingStore';

interface ROISelectorProps {
  canvasWidth: number;
  canvasHeight: number;
}

export default function ROISelector({ canvasWidth, canvasHeight }: ROISelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);

  const status = useMotionTrackingStore((s) => s.status);
  const mode = useMotionTrackingStore((s) => s.mode);
  const roi = useMotionTrackingStore((s) => s.roi);
  const previewPoints = useMotionTrackingStore((s) => s.previewPoints);
  const sourceVideoWidth = useMotionTrackingStore((s) => s.sourceVideoWidth);
  const sourceVideoHeight = useMotionTrackingStore((s) => s.sourceVideoHeight);
  const setROI = useMotionTrackingStore((s) => s.setROI);

  const isActive = status === 'selectingROI' || status === 'tracking' || status === 'completed';

  // Convert canvas coordinates to source video pixel coordinates
  const canvasToVideo = useCallback(
    (cx: number, cy: number) => {
      if (!sourceVideoWidth || !sourceVideoHeight) return { x: 0, y: 0 };

      // Aspect-fit: figure out how the video fits in the canvas
      const videoAspect = sourceVideoWidth / sourceVideoHeight;
      const canvasAspect = canvasWidth / canvasHeight;

      let renderW: number, renderH: number, offsetX: number, offsetY: number;

      if (videoAspect > canvasAspect) {
        renderW = canvasWidth;
        renderH = canvasWidth / videoAspect;
        offsetX = 0;
        offsetY = (canvasHeight - renderH) / 2;
      } else {
        renderH = canvasHeight;
        renderW = canvasHeight * videoAspect;
        offsetX = (canvasWidth - renderW) / 2;
        offsetY = 0;
      }

      return {
        x: ((cx - offsetX) / renderW) * sourceVideoWidth,
        y: ((cy - offsetY) / renderH) * sourceVideoHeight,
      };
    },
    [canvasWidth, canvasHeight, sourceVideoWidth, sourceVideoHeight],
  );

  // Convert video pixel coordinates to canvas coordinates
  const videoToCanvas = useCallback(
    (vx: number, vy: number) => {
      if (!sourceVideoWidth || !sourceVideoHeight) return { x: 0, y: 0 };

      const videoAspect = sourceVideoWidth / sourceVideoHeight;
      const canvasAspect = canvasWidth / canvasHeight;

      let renderW: number, renderH: number, offsetX: number, offsetY: number;

      if (videoAspect > canvasAspect) {
        renderW = canvasWidth;
        renderH = canvasWidth / videoAspect;
        offsetX = 0;
        offsetY = (canvasHeight - renderH) / 2;
      } else {
        renderH = canvasHeight;
        renderW = canvasHeight * videoAspect;
        offsetX = (canvasWidth - renderW) / 2;
        offsetY = 0;
      }

      return {
        x: (vx / sourceVideoWidth) * renderW + offsetX,
        y: (vy / sourceVideoHeight) * renderH + offsetY,
      };
    },
    [canvasWidth, canvasHeight, sourceVideoWidth, sourceVideoHeight],
  );

  // Drawing handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (status !== 'selectingROI') return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (mode === 'point') {
        // Point mode: single click sets ROI as small region around click
        const videoPt = canvasToVideo(pos.x, pos.y);
        const size = Math.min(sourceVideoWidth, sourceVideoHeight) * 0.05;
        setROI({
          x: Math.max(0, videoPt.x - size / 2),
          y: Math.max(0, videoPt.y - size / 2),
          width: size,
          height: size,
        });
      } else {
        setDrawing(true);
        setStartPos(pos);
        setCurrentPos(pos);
      }
    },
    [status, mode, canvasToVideo, setROI, sourceVideoWidth, sourceVideoHeight],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setCurrentPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [drawing],
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing || !startPos || !currentPos) return;
    setDrawing(false);

    // Convert to video coordinates
    const v1 = canvasToVideo(startPos.x, startPos.y);
    const v2 = canvasToVideo(currentPos.x, currentPos.y);

    const x = Math.min(v1.x, v2.x);
    const y = Math.min(v1.y, v2.y);
    const w = Math.abs(v2.x - v1.x);
    const h = Math.abs(v2.y - v1.y);

    if (w > 5 && h > 5) {
      setROI({
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.min(w, sourceVideoWidth - x),
        height: Math.min(h, sourceVideoHeight - y),
      });
    }

    setStartPos(null);
    setCurrentPos(null);
  }, [drawing, startPos, currentPos, canvasToVideo, setROI, sourceVideoWidth, sourceVideoHeight]);

  // Draw overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw ROI rectangle
    if (roi) {
      const topLeft = videoToCanvas(roi.x, roi.y);
      const bottomRight = videoToCanvas(roi.x + roi.width, roi.y + roi.height);
      const rw = bottomRight.x - topLeft.x;
      const rh = bottomRight.y - topLeft.y;

      // Semi-transparent fill
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(topLeft.x, topLeft.y, rw, rh);

      // Dashed border
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(topLeft.x, topLeft.y, rw, rh);
      ctx.setLineDash([]);

      // Corner handles
      const handleSize = 6;
      ctx.fillStyle = '#3b82f6';
      const corners = [
        [topLeft.x, topLeft.y],
        [bottomRight.x, topLeft.y],
        [topLeft.x, bottomRight.y],
        [bottomRight.x, bottomRight.y],
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      }
    }

    // Draw in-progress drawing rectangle
    if (drawing && startPos && currentPos) {
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const w = Math.abs(currentPos.x - startPos.x);
      const h = Math.abs(currentPos.y - startPos.y);

      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Draw tracking preview path
    if (previewPoints.length > 1) {
      ctx.lineWidth = 1.5;
      for (let i = 1; i < previewPoints.length; i++) {
        const prev = videoToCanvas(previewPoints[i - 1].centerX, previewPoints[i - 1].centerY);
        const curr = videoToCanvas(previewPoints[i].centerX, previewPoints[i].centerY);
        const conf = previewPoints[i].confidence;

        // Color by confidence: green (high) → red (low)
        const r = Math.round((1 - conf) * 255);
        const g = Math.round(conf * 200);
        ctx.strokeStyle = `rgb(${r}, ${g}, 50)`;

        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }

      // Draw dots at each tracked point
      for (const pt of previewPoints) {
        const pos = videoToCanvas(pt.centerX, pt.centerY);
        const conf = pt.confidence;
        const r = Math.round((1 - conf) * 255);
        const g = Math.round(conf * 200);

        ctx.fillStyle = `rgb(${r}, ${g}, 50)`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [canvasWidth, canvasHeight, roi, drawing, startPos, currentPos, previewPoints, videoToCanvas]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        cursor: status === 'selectingROI' ? 'crosshair' : 'default',
        pointerEvents: status === 'selectingROI' ? 'auto' : 'none',
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
