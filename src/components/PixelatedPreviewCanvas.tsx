'use client';

import React, { useRef, useEffect, TouchEvent, MouseEvent, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { getCellsInBrush, clientToCanvasCoords, GridCell } from '../utils/selectionUtils';

interface PixelatedPreviewCanvasProps {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  isManualColoringMode: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onInteraction: (
    clientX: number,
    clientY: number,
    pageX: number,
    pageY: number,
    isClick: boolean,
    isTouchEnd?: boolean
  ) => void;
  highlightColorKey?: string | null;
  onHighlightComplete?: () => void;
  // 噪点多色高亮 — 高亮所有 hex 在此集合中的像素（金色脉冲）
  highlightNoiseHexes?: Set<string> | null;
  // 笔刷选择
  isBrushMode?: boolean;
  selectionMask?: Set<string>;
  brushRadius?: number;
  onBrushStroke?: (cells: GridCell[], isAdditive: boolean) => void;
  onBrushEnd?: () => void;
  // 纯净预览：关闭网格线
  showGrid?: boolean;
}

const drawPixelatedCanvas = (
  dataToDraw: MappedPixel[][],
  canvas: HTMLCanvasElement | null,
  dims: { N: number; M: number } | null,
  highlightColorKey?: string | null,
  isHighlighting?: boolean,
  selectionMask?: Set<string>,
  showGrid: boolean = true,
  highlightNoiseHexes?: Set<string> | null,
) => {
  if (!canvas || !dims || !dataToDraw) return;

  const pixelatedCtx = canvas.getContext('2d');
  if (!pixelatedCtx) return;

  const isDarkMode = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');
  const externalBackgroundColor = isDarkMode ? '#374151' : '#F3F4F6';
  const gridLineColor = isDarkMode ? '#4B5563' : '#DDDDDD';

  const { N, M } = dims;
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;
  const cellW = outputWidth / N;
  const cellH = outputHeight / M;

  pixelatedCtx.clearRect(0, 0, outputWidth, outputHeight);
  pixelatedCtx.lineWidth = 0.5;

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const cell = dataToDraw[j]?.[i];
      if (!cell) continue;
      const dx = i * cellW;
      const dy = j * cellH;

      pixelatedCtx.fillStyle = cell.isExternal ? externalBackgroundColor : cell.color;
      pixelatedCtx.fillRect(dx, dy, cellW, cellH);

      // 高亮逻辑：优先 highlightColorKey（单色），其次 highlightNoiseHexes（多色噪点）
      const effectiveHighlightHexes: Set<string> | null =
        (isHighlighting && highlightColorKey) ? new Set([highlightColorKey.toUpperCase()]) :
        (highlightNoiseHexes && highlightNoiseHexes.size > 0) ? highlightNoiseHexes :
        null;

      if (effectiveHighlightHexes) {
        const matchesHighlight = !cell.isExternal && effectiveHighlightHexes.has(cell.color.toUpperCase());
        if (matchesHighlight) {
          // 金色脉冲覆盖层（匹配 FocusCanvas 高亮风格）
          const pulse = 0.3 + 0.25 * Math.sin(Date.now() / 250);
          pixelatedCtx.fillStyle = `rgba(251,191,36,${pulse})`;
          pixelatedCtx.fillRect(dx + 0.5, dy + 0.5, cellW - 1, cellH - 1);
          // 琥珀发光环
          pixelatedCtx.strokeStyle = '#f59e0b';
          pixelatedCtx.lineWidth = Math.max(2, cellW * 0.15);
          pixelatedCtx.shadowColor = '#f59e0b';
          pixelatedCtx.shadowBlur = 8;
          pixelatedCtx.beginPath();
          pixelatedCtx.roundRect(dx + 1, dy + 1, cellW - 2, cellH - 2, Math.max(1, cellW * 0.1));
          pixelatedCtx.stroke();
          pixelatedCtx.shadowBlur = 0;
          // 白色内线
          pixelatedCtx.strokeStyle = 'rgba(255,255,255,0.6)';
          pixelatedCtx.lineWidth = 1;
          pixelatedCtx.beginPath();
          pixelatedCtx.roundRect(dx + 2, dy + 2, cellW - 4, cellH - 4, Math.max(1, cellW * 0.08));
          pixelatedCtx.stroke();
        } else {
          pixelatedCtx.fillStyle = 'rgba(0,0,0,0.55)';
          pixelatedCtx.fillRect(dx, dy, cellW, cellH);
        }
      }

      // 选择覆盖层：35% 紫色
      if (selectionMask && selectionMask.has(`${j},${i}`)) {
        pixelatedCtx.fillStyle = 'rgba(128,0,128,0.35)';
        pixelatedCtx.fillRect(dx, dy, cellW, cellH);
      }

      if (showGrid) {
        pixelatedCtx.strokeStyle = gridLineColor;
        pixelatedCtx.strokeRect(dx + 0.5, dy + 0.5, cellW, cellH);
      }
    }
  }
};

const PixelatedPreviewCanvas: React.FC<PixelatedPreviewCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  isManualColoringMode,
  canvasRef,
  onInteraction,
  highlightColorKey,
  onHighlightComplete,
  highlightNoiseHexes,
  isBrushMode = false,
  selectionMask,
  brushRadius = 3,
  onBrushStroke,
  onBrushEnd,
  showGrid = true,
}) => {
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const [isHighlighting, setIsHighlighting] = useState(false);

  const isBrushingRef = useRef(false);
  const isAdditiveRef = useRef(false);

  // 全局鼠标监听：确保拖拽时不因移出 canvas 而中断
  useEffect(() => {
    if (!isBrushMode) return;
    const onGlobalMove = (e: globalThis.MouseEvent) => {
      drawRingRef.current(e.clientX, e.clientY);
      if (isBrushingRef.current) doBrushRef.current(e.clientX, e.clientY);
    };
    const onGlobalUp = () => {
      if (isBrushingRef.current) { isBrushingRef.current = false; onBrushEnd?.(); }
    };
    window.addEventListener('mousemove', onGlobalMove);
    window.addEventListener('mouseup', onGlobalUp);
    return () => {
      window.removeEventListener('mousemove', onGlobalMove);
      window.removeEventListener('mouseup', onGlobalUp);
    };
  }, [isBrushMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => {
      const d = document.documentElement.classList.contains('dark');
      if (d !== darkModeState) setDarkModeState(d);
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [darkModeState]);

  useEffect(() => {
    if (mappedPixelData && gridDimensions && canvasRef.current && darkModeState !== null) {
      drawPixelatedCanvas(mappedPixelData, canvasRef.current, gridDimensions, highlightColorKey, isHighlighting, selectionMask, showGrid, highlightNoiseHexes);
    }
  }, [mappedPixelData, gridDimensions, canvasRef, darkModeState, highlightColorKey, isHighlighting, selectionMask, showGrid, highlightNoiseHexes]);

  useEffect(() => {
    if (highlightColorKey && mappedPixelData && gridDimensions) {
      setIsHighlighting(true);
      // RAF 循环实现脉冲动画
      let raf: number;
      const loop = () => {
        drawPixelatedCanvas(mappedPixelData, canvasRef.current!, gridDimensions, highlightColorKey, true, selectionMask, showGrid, highlightNoiseHexes);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      const t = setTimeout(() => {
        cancelAnimationFrame(raf);
        setIsHighlighting(false);
        onHighlightComplete?.();
      }, 3000);
      return () => {
        clearTimeout(t);
        cancelAnimationFrame(raf);
      };
    }
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete, showGrid]);

  // 噪点多色高亮 RAF 循环
  useEffect(() => {
    if (highlightNoiseHexes && highlightNoiseHexes.size > 0 && mappedPixelData && gridDimensions && canvasRef.current) {
      const canvasEl = canvasRef.current;
      let raf: number;
      const loop = () => {
        drawPixelatedCanvas(mappedPixelData, canvasEl, gridDimensions, null, false, selectionMask, showGrid, highlightNoiseHexes);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
  }, [highlightNoiseHexes, mappedPixelData, gridDimensions, showGrid]);

  const doBrush = (clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c || !gridDimensions || !onBrushStroke) return;
    const coords = clientToCanvasCoords(clientX, clientY, c);
    if (!coords) return;
    const { N, M } = gridDimensions;
    const cells = getCellsInBrush(coords.x, coords.y, c.width, c.height, N, M, brushRadius);
    if (cells.length > 0) onBrushStroke(cells, isAdditiveRef.current);
  };

  // Mouse
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (isBrushMode) {
      isBrushingRef.current = true;
      isAdditiveRef.current = e.shiftKey;
      doBrush(e.clientX, e.clientY);
      e.preventDefault();
    }
  };
  const handleMouseUp = () => { if (isBrushingRef.current) { isBrushingRef.current = false; onBrushEnd?.(); } };
  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (isBrushMode) return;
    onInteraction(e.clientX, e.clientY, e.pageX, e.pageY, true, false);
  };

  // Touch
  const handleTouchStart = (e: TouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartPosRef.current = { x: t.clientX, y: t.clientY, pageX: t.pageX, pageY: t.pageY };
    touchMovedRef.current = false;
    if (isBrushMode && onBrushStroke) { isBrushingRef.current = true; isAdditiveRef.current = e.shiftKey; doBrush(t.clientX, t.clientY); e.preventDefault(); return; }
    if (!isManualColoringMode && !isBrushMode) onInteraction(t.clientX, t.clientY, t.pageX, t.pageY, false);
  };
  const handleTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0];
    if (!t) return;
    if (isBrushMode && isBrushingRef.current) { doBrush(t.clientX, t.clientY); touchMovedRef.current = true; e.preventDefault(); return; }
    if (touchStartPosRef.current && (Math.abs(t.clientX - touchStartPosRef.current.x) > 10 || Math.abs(t.clientY - touchStartPosRef.current.y) > 10)) {
      if (!touchMovedRef.current) { touchMovedRef.current = true; onInteraction(0, 0, 0, 0, false, true); }
    }
  };
  const handleTouchEnd = () => {
    if (isBrushMode) { isBrushingRef.current = false; onBrushEnd?.(); touchStartPosRef.current = null; touchMovedRef.current = false; return; }
    if (isManualColoringMode && !touchMovedRef.current && touchStartPosRef.current) { const { x, y, pageX, pageY } = touchStartPosRef.current; onInteraction(x, y, pageX, pageY, true); }
    touchStartPosRef.current = null; touchMovedRef.current = false;
  };

  // 笔刷光标层 ref
  const cursorOverlayRef = useRef<HTMLCanvasElement>(null);

  // 笔刷光标位置
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);

  // 在笔刷模式下鼠标移动时重绘光标环
  const drawCursorRing = (clientX: number, clientY: number) => {
    const overlay = cursorOverlayRef.current;
    const main = canvasRef.current;
    if (!overlay || !main || !gridDimensions) return;

    const coords = clientToCanvasCoords(clientX, clientY, main);
    if (!coords) return;

    cursorPosRef.current = coords;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // overlay 尺寸跟随 main canvas
    overlay.width = main.width;
    overlay.height = main.height;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const rPx = brushRadius * (main.width / gridDimensions.N);
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, rPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)'; // purple-500
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const clearCursorRing = () => {
    cursorPosRef.current = null;
    const overlay = cursorOverlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  };

  // 用 ref 保存最新函数引用，供全局监听器使用
  const doBrushRef = useRef(doBrush);
  doBrushRef.current = doBrush;
  const drawRingRef = useRef(drawCursorRing);
  drawRingRef.current = drawCursorRing;

  // 包装 handleMouseMove
  const handleMouseMoveWrapped = (e: MouseEvent<HTMLCanvasElement>) => {
    if (isBrushMode) {
      drawCursorRing(e.clientX, e.clientY);
      if (isBrushingRef.current) doBrush(e.clientX, e.clientY);
    }
    if (!isManualColoringMode && !isBrushMode) {
      onInteraction(e.clientX, e.clientY, e.pageX, e.pageY, false);
    }
  };

  const handleMouseLeaveWrapped = () => {
    clearCursorRing();
    handleMouseUp();
    onInteraction(0, 0, 0, 0, false, true);
  };

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMoveWrapped}
        onMouseLeave={handleMouseLeaveWrapped}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`border border-gray-300 dark:border-gray-600 max-w-full h-auto rounded block ${isBrushMode ? 'cursor-none' : isManualColoringMode ? 'cursor-pointer' : 'cursor-grab'}`}
        style={{ imageRendering: 'pixelated' }}
      />
      <canvas
        ref={cursorOverlayRef}
        className="absolute top-0 left-0 max-w-full h-auto rounded pointer-events-none"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};

export default PixelatedPreviewCanvas;
