'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface DissolvePanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onApply: (params: { angle: number; intensity: number; seed: number }) => void;
  selectionCount: number;
  isActive: boolean;
  onActivate: () => void;
}

/**
 * 随机生成若干个消散种子供用户选择
 */
function generateSeedOptions(count: number = 6): number[] {
  const seeds: number[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push(Math.floor(Math.random() * 100000));
  }
  return seeds;
}

const DissolvePanel: React.FC<DissolvePanelProps> = ({
  isOpen,
  onToggleOpen,
  onApply,
  selectionCount,
  isActive,
  onActivate,
}) => {
  const [angle, setAngle] = useState(45);
  const [intensity, setIntensity] = useState(50);
  const [selectedSeed, setSelectedSeed] = useState(42);
  const [seedOptions, setSeedOptions] = useState<number[]>(() => generateSeedOptions());

  const [position, setPosition] = useState({ x: 20, y: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // 刷新种子选项
  const handleRefreshSeeds = () => {
    const newSeeds = generateSeedOptions();
    setSeedOptions(newSeeds);
    if (!newSeeds.includes(selectedSeed)) {
      setSelectedSeed(newSeeds[0]);
    }
  };

  // 拖拽
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!panelRef.current) return;
      onActivate();
      const rect = panelRef.current.getBoundingClientRect();
      setIsDragging(true);
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      e.preventDefault();
    },
    [onActivate]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (clientX: number, clientY: number) => {
      setPosition({ x: clientX - dragOffset.x, y: clientY - dragOffset.y });
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
    };
  }, [isDragging, dragOffset]);

  // 每次打开时重置种子
  useEffect(() => {
    if (isOpen) {
      handleRefreshSeeds();
    }
  }, [isOpen]);

  // 角度输入处理
  const handleAngleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value) || 0;
    setAngle(Math.max(0, Math.min(360, v)));
  };

  if (!isOpen) return null;

  const directionLabels: Record<string, string> = {
    '0': '→ 右',
    '45': '↗ 右上',
    '90': '↑ 上',
    '135': '↖ 左上',
    '180': '← 左',
    '225': '↙ 左下',
    '270': '↓ 下',
    '315': '↘ 右下',
    '360': '→ 右',
  };

  return (
    <div
      ref={panelRef}
      className={`fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 select-none ${
        isActive ? 'z-[70]' : 'z-[50]'
      }`}
      style={{ left: position.x, top: position.y, width: '280px' }}
      onClick={onActivate}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-xl cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
          <span className="text-sm font-medium">消散设置</span>
        </div>
        <button
          onClick={onToggleOpen}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          title="关闭"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容 */}
      <div className="p-4 space-y-4">
        {/* 选中数量 */}
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          已选中 <span className="font-bold text-purple-600">{selectionCount}</span> 个格子
        </div>

        {/* 角度 */}
        <div>
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
            <span>消散角度</span>
            <span>
              {angle}° {directionLabels[String(angle)] || ''}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            step="15"
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <div className="flex gap-1 mt-1">
            <input
              type="number"
              value={angle}
              onChange={handleAngleChange}
              className="w-full text-xs p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              min={0}
              max={360}
            />
          </div>
        </div>

        {/* 力度 */}
        <div>
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
            <span>消散力度</span>
            <span>{intensity}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
        </div>

        {/* 随机种子 */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">粒子形态</span>
            <button
              onClick={handleRefreshSeeds}
              className="text-xs text-purple-500 hover:text-purple-600 transition-colors"
            >
              🔄 刷新
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {seedOptions.map((seed) => (
              <button
                key={seed}
                onClick={() => setSelectedSeed(seed)}
                className={`text-xs py-1.5 px-2 rounded-lg border transition-all ${
                  selectedSeed === seed
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-300'
                }`}
              >
                #{seed}
              </button>
            ))}
          </div>
        </div>

        {/* 执行按钮 */}
        <button
          onClick={() => onApply({ angle, intensity, seed: selectedSeed })}
          disabled={selectionCount === 0}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
            selectionCount > 0
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-md hover:shadow-lg'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {selectionCount > 0 ? '✨ 开始消散' : '请先选择区域'}
        </button>
      </div>
    </div>
  );
};

export default DissolvePanel;
