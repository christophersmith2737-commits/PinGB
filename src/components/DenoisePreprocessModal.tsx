'use client';

/**
 * 均值滤波去噪预处理弹窗 — 进入逆向图纸识别之前，对上传的原图做卷积均值滤波，
 * 消除拍摄噪点。提供处理前/后滑块对比窗口，确认后把处理后图片交给识别流程。
 */

import React, { useEffect, useRef, useState } from 'react';
import { boxBlur, medianFilter, unsharpMask } from '../utils/denoise';

interface DenoisePreprocessModalProps {
  imageSrc: string;
  isOpen: boolean;
  onClose: () => void;
  onUseProcessed: (processedSrc: string) => void;
  onUseOriginal: () => void;
}

// 处理模式：均值去噪 / 中值去噪（保边）/ USM 锐化
type DenoiseMode = 'box' | 'median' | 'unsharp';

const MODE_OPTIONS: { mode: DenoiseMode; label: string; hint: string }[] = [
  { mode: 'box', label: '均值滤波', hint: '整体去噪，画面变柔和' },
  { mode: 'median', label: '中值滤波', hint: '去噪点且保持边缘清晰' },
  { mode: 'unsharp', label: 'USM 锐化', hint: '增强边缘对比，画面更清晰' },
];

const BOX_RADIUS_OPTIONS = [
  { value: 1, label: '3×3' },
  { value: 2, label: '5×5' },
  { value: 3, label: '7×7' },
];

const MEDIAN_RADIUS_OPTIONS = [
  { value: 1, label: '3×3' },
  { value: 2, label: '5×5' },
];

const UNSHARP_STRENGTH_OPTIONS = [
  { value: 1, label: '强度 ×1' },
  { value: 2, label: '强度 ×2' },
  { value: 3, label: '强度 ×3' },
];

export default function DenoisePreprocessModal({
  imageSrc,
  isOpen,
  onClose,
  onUseProcessed,
  onUseOriginal,
}: DenoisePreprocessModalProps) {
  // 隐藏画布：src 放原图，dst 放滤波结果（导出用）
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<DenoiseMode>('median');
  const [radius, setRadius] = useState(1);
  const [strength, setStrength] = useState(2);
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [splitPos, setSplitPos] = useState(50); // 对比滑块位置 %

  // ── 打开时重置并加载原图 ──
  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    setImg(null);
    setProcessedSrc(null);
    setMode('median');
    setRadius(1);
    setStrength(2);
    setSplitPos(50);
    setProcessing(false);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = imageSrc;
  }, [isOpen, imageSrc]);

  // ── 参数变化后防抖重算 ──
  useEffect(() => {
    if (!img) return;
    const timer = setTimeout(() => {
      setProcessing(true);
      requestAnimationFrame(() => {
        const srcCanvas = sourceCanvasRef.current;
        const dstCanvas = processedCanvasRef.current;
        if (!srcCanvas || !dstCanvas) {
          setProcessing(false);
          return;
        }
        srcCanvas.width = img.naturalWidth;
        srcCanvas.height = img.naturalHeight;
        const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        if (!sctx) {
          setProcessing(false);
          return;
        }
        sctx.drawImage(img, 0, 0);
        const imageData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
        const processed =
          mode === 'box'
            ? boxBlur(imageData, radius)
            : mode === 'median'
              ? medianFilter(imageData, radius)
              : unsharpMask(imageData, 1, strength);
        dstCanvas.width = srcCanvas.width;
        dstCanvas.height = srcCanvas.height;
        const dctx = dstCanvas.getContext('2d');
        if (!dctx) {
          setProcessing(false);
          return;
        }
        dctx.putImageData(processed, 0, 0);
        setProcessedSrc(dstCanvas.toDataURL('image/png'));
        setProcessing(false);
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [img, mode, radius, strength]);

  // ── 对比滑块拖拽 ──
  const updateSplit = (clientX: number) => {
    const rect = compareRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplitPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* 隐藏的离屏画布（只用于像素计算与导出） */}
      <canvas ref={sourceCanvasRef} style={{ display: 'none' }} />
      <canvas ref={processedCanvasRef} style={{ display: 'none' }} />

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            均值滤波去噪预处理
            <span className="ml-3 text-sm font-normal text-gray-500 dark:text-gray-400">
              消除原图噪点后再进入识别
            </span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 对比区 */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <div className="w-full max-w-3xl">
            <div
              ref={compareRef}
              className="relative overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600 select-none touch-none cursor-col-resize"
              onPointerDown={e => {
                draggingRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                updateSplit(e.clientX);
              }}
              onPointerMove={e => {
                if (draggingRef.current) updateSplit(e.clientX);
              }}
              onPointerUp={() => { draggingRef.current = false; }}
              onPointerCancel={() => { draggingRef.current = false; }}
            >
              {/* 左半：原图 */}
              <img src={imageSrc} alt="原图" draggable={false} className="block w-full h-auto" />
              {/* 右半：处理后（clip 出滑块右侧区域） */}
              <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}>
                <img
                  src={processedSrc || imageSrc}
                  alt="处理后"
                  draggable={false}
                  className="absolute inset-0 block w-full h-auto"
                />
              </div>
              {/* 分割线 + 手柄 */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
                style={{ left: `${splitPos}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 text-xs font-bold">
                  ⇄
                </div>
              </div>
              {/* 标签 */}
              <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-medium text-white bg-black/60 rounded">
                原图
              </span>
              <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium text-white bg-black/60 rounded">
                处理后
              </span>
              {/* 处理中遮罩 */}
              {processing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="px-3 py-1 text-sm text-white bg-black/60 rounded">处理中…</span>
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
              拖动中间滑块对比处理前后效果
            </p>
          </div>
        </div>

        {/* 控制栏 */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">处理方式：</span>
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.mode}
                onClick={() => setMode(opt.mode)}
                className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                  mode === opt.mode
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {mode === 'box' &&
              BOX_RADIUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRadius(opt.value)}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                    radius === opt.value
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  核 {opt.label}
                </button>
              ))}
            {mode === 'median' &&
              MEDIAN_RADIUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRadius(opt.value)}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                    radius === opt.value
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  窗口 {opt.label}
                </button>
              ))}
            {mode === 'unsharp' &&
              UNSHARP_STRENGTH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStrength(opt.value)}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                    strength === opt.value
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {MODE_OPTIONS.find(o => o.mode === mode)?.hint}
            </span>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={onUseOriginal}
              className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              跳过，使用原图
            </button>
            <button
              onClick={() => processedSrc && onUseProcessed(processedSrc)}
              disabled={!processedSrc || processing}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              使用处理后图片，进入识别
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
