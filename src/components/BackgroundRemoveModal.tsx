'use client';

import React, { useState } from 'react';
import { removeBackground } from '../utils/bgRemove';

interface BackgroundRemoveModalProps {
  isOpen: boolean;
  imageSrc: string;
  originalFileName?: string;
  onClose: () => void;
  onApply: (resultImageSrc: string) => void;
}

const BackgroundRemoveModal: React.FC<BackgroundRemoveModalProps> = ({
  isOpen, imageSrc, originalFileName, onClose, onApply,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSrc, setResultSrc] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  if (!isOpen) return null;

  const autoDownload = (src: string) => {
    const a = document.createElement('a');
    a.href = src;
    a.download = originalFileName ? `${originalFileName}_01.png` : '抠图结果_01.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRemove = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    try {
      const result = await removeBackground(imageSrc, (pct) => setProgress(pct));
      if (result.success && result.imageBase64) {
        setResultSrc(result.imageBase64);
        // 自动下载抠图结果
        autoDownload(result.imageBase64);
      } else {
        setError(result.error || '抠图失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '抠图失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => { if (resultSrc) onApply(resultSrc); };
  const handleDownload = () => {
    if (!resultSrc) return;
    const a = document.createElement('a');
    a.href = resultSrc;
    a.download = originalFileName ? `${originalFileName}_01.png` : '抠图结果_01.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const handleReset = () => { setResultSrc(null); setError(null); setProgress(0); };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium">智能抠图（本地处理）</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded text-xl">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            检测边框主色 → 洪水填充连通背景 → 透明替换。在原图分辨率下运行，不受像素化影响。
          </p>

          {/* 图片对比 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1 text-center">原图</div>
              <img src={imageSrc} alt="原图" className="w-full rounded-lg border border-gray-200 dark:border-gray-600 object-contain max-h-40" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1 text-center">抠图结果</div>
              {resultSrc ? (
                <img src={resultSrc} alt="结果" className="w-full rounded-lg border border-emerald-300 object-contain max-h-40" style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 16px 16px' }} />
              ) : (
                <div className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 text-xs min-h-[100px]">
                  {loading ? `处理中 ${progress}%...` : '等待处理'}
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-center text-xs text-gray-500">{progress}%</div>
            </div>
          )}
          {error && <div className="text-sm text-red-500 text-center">{error}</div>}

          <div className="flex gap-3">
            {!resultSrc ? (
              <button onClick={handleRemove} disabled={loading}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 transition-all">
                {loading ? '处理中...' : '开始抠图'}
              </button>
            ) : (
              <>
                <button onClick={handleReset} className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 transition-all">重新抠图</button>
                <button onClick={handleDownload} className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all text-sm">下载抠图</button>
                <button onClick={handleApply} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-teal-600 transition-all text-sm">应用抠图</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackgroundRemoveModal;
