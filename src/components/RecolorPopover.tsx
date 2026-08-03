'use client';

import React, { useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { convertColorKeyToHex, ColorSystem } from '../utils/colorSystemUtils';
import { getColorKeyByHex } from '../utils/colorSystemUtils';

interface NeighborColor {
  key: string;       // display key like "P01"
  hex: string;
  direction: string; // '上' | '下' | '左' | '右'
}

interface RecolorPopoverProps {
  // Position
  x: number;
  y: number;
  // Data
  cellData: MappedPixel;
  neighbors: NeighborColor[];  // valid neighbors only
  colorSystem: ColorSystem;
  // State
  step: 'menu' | 'colorOptions' | 'replaceOptions';
  // Callbacks
  onSelectColor: (hex: string) => void;
  onConfirmReplace: (scope: 'all' | 'single') => void;
  onClose: () => void;
  onBack: () => void;
}

export default function RecolorPopover({
  x, y, cellData, neighbors, colorSystem,
  step,
  onSelectColor, onConfirmReplace, onClose, onBack
}: RecolorPopoverProps) {
  const [manualInput, setManualInput] = useState('');

  const handleManualSubmit = () => {
    const hex = convertColorKeyToHex(manualInput.trim().toUpperCase(), colorSystem);
    if (hex && hex !== '?') {
      onSelectColor(hex);
    }
    setManualInput('');
  };

  const currentDisplayKey = getColorKeyByHex(cellData.color.toUpperCase(), colorSystem);

  return (
    <div
      className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3 min-w-[180px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">当前:</span>
          <span className="text-xs font-bold">{currentDisplayKey}</span>
          <span
            className="inline-block w-4 h-4 rounded border border-gray-300"
            style={{ backgroundColor: cellData.color }}
          />
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
      </div>

      {/* Step: menu */}
      {step === 'menu' && (
        <button
          onClick={() => onSelectColor('__SHOW_OPTIONS__')}
          className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-md transition-colors"
        >
          改色
        </button>
      )}

      {/* Step: colorOptions */}
      {step === 'colorOptions' && (
        <div className="space-y-2">
          <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 mb-1">&larr; 返回</button>
          <p className="text-xs text-gray-500 mb-1">选择目标颜色:</p>
          {neighbors.map((n) => (
            <button
              key={n.direction}
              onClick={() => onSelectColor(n.hex)}
              className="w-full flex items-center gap-2 py-1.5 px-3 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
            >
              <span
                className="inline-block w-5 h-5 rounded border border-gray-300 flex-shrink-0"
                style={{ backgroundColor: n.hex }}
              />
              <span className="text-gray-700 dark:text-gray-300">{n.direction}方颜色</span>
              <span className="text-xs text-gray-500 ml-auto">{n.key}</span>
            </button>
          ))}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="输入色号 (如P01)"
              className="flex-1 p-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
            />
            <button
              onClick={handleManualSubmit}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
            >
              确定
            </button>
          </div>
        </div>
      )}

      {/* Step: replaceOptions */}
      {step === 'replaceOptions' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-1">替换范围:</p>
          <button
            onClick={() => onConfirmReplace('all')}
            className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-md transition-colors"
          >
            替换所有同色 ({currentDisplayKey})
          </button>
          <button
            onClick={() => onConfirmReplace('single')}
            className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-md transition-colors"
          >
            只替换当前像素
          </button>
          <button onClick={onBack} className="w-full text-xs text-gray-400 hover:text-gray-600">&larr; 返回选色</button>
        </div>
      )}
    </div>
  );
}
