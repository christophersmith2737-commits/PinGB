'use client';

import React from 'react';

interface FloatingToolbarProps {
  isManualColoringMode: boolean;
  isPaletteOpen: boolean;
  onTogglePalette: () => void;
  onExitManualMode: () => void;
  onToggleMagnifier: () => void;
  isMagnifierActive: boolean;
  // 笔刷选择
  isBrushMode: boolean;
  onToggleBrush: () => void;
  brushRadius: number;
  onBrushRadiusChange: (r: number) => void;
  // 撤销
  undoCount: number;
  onUndo: () => void;
  // 消散
  isDissolvePanelOpen: boolean;
  onToggleDissolvePanel: () => void;
  selectionCount: number;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  isManualColoringMode,
  isPaletteOpen,
  onTogglePalette,
  onExitManualMode,
  onToggleMagnifier,
  isMagnifierActive,
  isBrushMode,
  onToggleBrush,
  brushRadius,
  onBrushRadiusChange,
  undoCount,
  onUndo,
  isDissolvePanelOpen,
  onToggleDissolvePanel,
  selectionCount,
}) => {
  if (!isManualColoringMode) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {/* 撤销按钮 */}
      <button
        onClick={onUndo}
        disabled={undoCount === 0}
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center relative ${
          undoCount > 0
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-200 dark:border-gray-700'
        }`}
        title={`撤销 (${undoCount} 步可撤销)`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
        </svg>
        {undoCount > 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white text-amber-600 text-[10px] rounded-full flex items-center justify-center font-bold border border-amber-300 shadow">
            {undoCount}
          </span>
        )}
      </button>

      {/* 笔刷选择按钮 */}
      <button
        onClick={onToggleBrush}
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center relative ${
          isBrushMode
            ? 'bg-purple-500 text-white hover:bg-purple-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
        }`}
        title={`笔刷选择 (Shift=追加, Ctrl+滚轮调大小, 当前: ${brushRadius})`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        {isBrushMode && (
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 text-xs rounded-full flex items-center justify-center font-bold border border-purple-300 dark:border-purple-600 shadow">
            {brushRadius}
          </span>
        )}
      </button>

      {/* 笔刷半径 — 笔刷模式激活时显示 */}
      {isBrushMode && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-purple-200 dark:border-purple-800 p-2.5 w-[80px] flex items-center gap-1.5">
          <span className="text-xs text-gray-400 shrink-0 font-medium">R</span>
          <input
            type="number"
            min="1" max="50"
            value={brushRadius}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 1 && v <= 50) onBrushRadiusChange(v);
            }}
            className="w-full text-sm p-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          />
        </div>
      )}

      {/* 调色盘开关 */}
      <button
        onClick={onTogglePalette}
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center ${
          isPaletteOpen
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
        }`}
        title={isPaletteOpen ? '关闭调色盘' : '打开调色盘'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
        </svg>
      </button>

      {/* 放大镜 */}
      <button
        onClick={onToggleMagnifier}
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center ${
          isMagnifierActive
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
        }`}
        title={isMagnifierActive ? '关闭放大镜' : '打开放大镜'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {/* 消散面板按钮 */}
      <button
        onClick={onToggleDissolvePanel}
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center relative ${
          isDissolvePanelOpen
            ? 'bg-pink-500 text-white hover:bg-pink-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
        }`}
        title={isDissolvePanelOpen ? '关闭消散面板' : '消散效果'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        {selectionCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {selectionCount > 99 ? '99+' : selectionCount}
          </span>
        )}
      </button>

      {/* 退出手动编辑模式 */}
      <button
        onClick={onExitManualMode}
        className="w-12 h-12 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-all duration-200 flex items-center justify-center"
        title="退出手动编辑模式"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default FloatingToolbar;
