'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { TaskItem } from '../utils/taskQueueGenerator';

interface FocusCanvasProps {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  currentTask: TaskItem | null;
  completedKeys: Set<string>;
  canvasScale?: number;
  canvasOffset?: { x: number; y: number };
  onScaleChange?: (scale: number) => void;
  onOffsetChange?: (offset: { x: number; y: number }) => void;
}

const FocusCanvas: React.FC<FocusCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  currentTask,
  completedKeys,
  canvasScale = 1,
  canvasOffset = { x: 0, y: 0 },
  onScaleChange,
  onOffsetChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pinchDist = useRef(0);
  const mouseMoved = useRef(false);

  // --- 格子大小 ---
  const cellSize = React.useMemo(() => {
    if (!gridDimensions) return 20;
    const { N, M } = gridDimensions;
    const s = Math.min(300 / N, 300 / M);
    return Math.max(12, Math.min(40, s));
  }, [gridDimensions]);

  // --- 当前任务坐标集合 ---
  const currentTaskKeys = React.useMemo(() => {
    if (!currentTask) return new Set<string>();
    const s = new Set<string>();
    for (const c of currentTask.coordinates) {
      s.add(`${c.row},${c.col}`);
    }
    return s;
  }, [currentTask]);

  // --- 渲染 ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const dpr = window.devicePixelRatio || 1;
    const innerW = N * cellSize;
    const innerH = M * cellSize;
    const displayW = innerW * canvasScale;
    const displayH = innerH * canvasScale;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 深色背景
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, displayW, displayH);

    const sc = cellSize * canvasScale;
    const ox = canvasOffset.x;
    const oy = canvasOffset.y;

    const startCol = Math.max(0, Math.floor(-ox / sc));
    const startRow = Math.max(0, Math.floor(-oy / sc));
    const endCol = Math.min(N, Math.ceil((-ox + displayW) / sc) + 1);
    const endRow = Math.min(M, Math.ceil((-oy + displayH) / sc) + 1);

    // 分类绘制
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const cell = mappedPixelData[row]?.[col];
        if (!cell || cell.isExternal) continue;

        const x = col * sc + ox;
        const y = row * sc + oy;
        const k = `${row},${col}`;

        if (completedKeys.has(k)) {
          // 已完成：实色 + 白点
          ctx.globalAlpha = 1;
          ctx.fillStyle = cell.color;
          ctx.fillRect(x, y, sc, sc);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.arc(x + sc / 2, y + sc / 2, sc * 0.16, 0, Math.PI * 2);
          ctx.fill();
        } else if (currentTaskKeys.has(k)) {
          // 当前任务豆子：强高亮
          ctx.globalAlpha = 1;
          ctx.fillStyle = cell.color;
          ctx.fillRect(x, y, sc, sc);
          // 金色脉冲覆盖
          const pulse = 0.4 + 0.3 * Math.sin(Date.now() / 300);
          ctx.fillStyle = `rgba(251,191,36,${pulse})`;
          ctx.fillRect(x + 1, y + 1, sc - 2, sc - 2);
          // 粗外圈发光环
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = Math.max(3, sc * 0.25);
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.roundRect(x + 1.5, y + 1.5, sc - 3, sc - 3, Math.max(2, sc * 0.15));
          ctx.stroke();
          // 内圈白线
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.roundRect(x + 3, y + 3, sc - 6, sc - 6, Math.max(1, sc * 0.1));
          ctx.stroke();
        } else {
          // 未完成：半透明
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = cell.color;
          ctx.fillRect(x, y, sc, sc);
        }
      }
    }

    // 网格线
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    for (let row = startRow; row <= endRow; row++) {
      const y = row * sc + oy;
      ctx.beginPath();
      ctx.moveTo(startCol * sc + ox, y);
      ctx.lineTo(endCol * sc + ox, y);
      ctx.stroke();
    }
    for (let col = startCol; col <= endCol; col++) {
      const x = col * sc + ox;
      ctx.beginPath();
      ctx.moveTo(x, startRow * sc + oy);
      ctx.lineTo(x, endRow * sc + oy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [mappedPixelData, gridDimensions, cellSize, canvasScale, canvasOffset, completedKeys, currentTaskKeys]);

  // 持续重绘以实现脉冲动画（仅在 playing 且有当前任务时）
  useEffect(() => {
    if (!currentTask || currentTaskKeys.size === 0) {
      draw();
      return;
    }
    let raf: number;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, currentTask, currentTaskKeys]);

  // 静态重绘（无当前任务时）
  useEffect(() => {
    if (!currentTask || currentTaskKeys.size === 0) {
      draw();
    }
  }, [draw, currentTask, currentTaskKeys]);

  // --- 滚轮缩放 ---
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const newScale = Math.max(0.3, Math.min(3, canvasScale - Math.sign(e.deltaY) * 0.1));
      onScaleChange?.(newScale);
    },
    [canvasScale, onScaleChange],
  );

  // --- 拖拽 ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    mouseMoved.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) mouseMoved.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      onOffsetChange?.({ x: canvasOffset.x + dx, y: canvasOffset.y + dy });
    },
    [canvasOffset, onOffsetChange],
  );

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  // --- 触摸 ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isDragging.current = true;
      mouseMoved.current = false;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (pinchDist.current > 0) {
          const newScale = Math.max(0.3, Math.min(3, canvasScale * (dist / pinchDist.current)));
          onScaleChange?.(newScale);
        }
        pinchDist.current = dist;
      } else if (e.touches.length === 1 && isDragging.current) {
        const dx = e.touches[0].clientX - lastPos.current.x;
        const dy = e.touches[0].clientY - lastPos.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mouseMoved.current = true;
        lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        onOffsetChange?.({ x: canvasOffset.x + dx, y: canvasOffset.y + dy });
      }
    },
    [canvasScale, canvasOffset, onScaleChange, onOffsetChange],
  );

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    pinchDist.current = 0;
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden bg-gray-900 rounded-xl select-none relative"
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="cursor-grab"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};

export default FocusCanvas;
