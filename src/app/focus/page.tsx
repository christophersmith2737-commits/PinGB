'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MappedPixel, ColorSystem } from '../../utils/pixelation';
import { generateTaskQueue, TaskQueue, TaskItem } from '../../utils/taskQueueGenerator';
import FocusCanvas from '../../components/FocusCanvas';
import FocusStartOverlay from '../../components/FocusStartOverlay';
import { getColorKeyByHex } from '../../utils/colorSystemUtils';

export default function FocusModePage() {
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [selectedColorSystem, setSelectedColorSystem] = useState<ColorSystem>('MARD');

  const [taskQueue, setTaskQueue] = useState<TaskQueue | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [completedCount, setCompletedCount] = useState(0);

  const [phase, setPhase] = useState<'loading' | 'idle' | 'countdown' | 'playing' | 'finished'>('loading');
  const [countdown, setCountdown] = useState(3);
  const countdownRef = useRef(3);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerStartRef = useRef(0);

  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });

  // ============================================================
  // 加载
  // ============================================================
  useEffect(() => {
    try {
      const savedPixelData = localStorage.getItem('focusMode_pixelData');
      const savedGridDimensions = localStorage.getItem('focusMode_gridDimensions');
      const savedColorSystem = localStorage.getItem('focusMode_selectedColorSystem');
      if (!savedPixelData || !savedGridDimensions) { window.location.href = '/'; return; }
      const pixelData = JSON.parse(savedPixelData) as MappedPixel[][];
      const gridDim = JSON.parse(savedGridDimensions) as { N: number; M: number };
      const colorSys = (savedColorSystem as ColorSystem) || 'MARD';
      setMappedPixelData(pixelData);
      setGridDimensions(gridDim);
      setSelectedColorSystem(colorSys);
      setTaskQueue(generateTaskQueue(pixelData, gridDim));
      setPhase('idle');
    } catch (e) {
      console.error('Failed to load focus mode data:', e);
      window.location.href = '/';
    }
  }, []);

  // ============================================================
  // 计时
  // ============================================================
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - timerStartRef.current) / 1000));
    }, 200);
    return () => clearInterval(interval);
  }, [timerRunning]);

  // ============================================================
  // START
  // ============================================================
  const handleStart = useCallback(() => {
    timerStartRef.current = Date.now();
    setTimerRunning(true);
    setPhase('countdown'); countdownRef.current = 3; setCountdown(3);
    const timer = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) { clearInterval(timer); setPhase('playing'); }
      else { setCountdown(countdownRef.current); }
    }, 1000);
  }, []);

  // ============================================================
  // 推进
  // ============================================================
  const handleAdvanceTask = useCallback(() => {
    if (!taskQueue || phase !== 'playing') return;
    const currentTask = taskQueue.tasks[currentTaskIndex];
    if (!currentTask) return;
    const newCompletedKeys = new Set(completedKeys);
    let newCompletedCount = completedCount;
    for (const coord of currentTask.coordinates) {
      const k = `${coord.row},${coord.col}`;
      if (!newCompletedKeys.has(k)) { newCompletedKeys.add(k); newCompletedCount++; }
    }
    setCompletedKeys(newCompletedKeys);
    setCompletedCount(newCompletedCount);
    const nextIndex = currentTaskIndex + 1;
    if (nextIndex >= taskQueue.tasks.length) { setTimerRunning(false); setPhase('finished'); }
    else { setCurrentTaskIndex(nextIndex); }
  }, [taskQueue, currentTaskIndex, phase, completedKeys, completedCount]);

  // ============================================================
  // 派生
  // ============================================================
  const currentTask: TaskItem | null = useMemo(() => {
    if (!taskQueue || currentTaskIndex >= taskQueue.tasks.length) return null;
    return taskQueue.tasks[currentTaskIndex];
  }, [taskQueue, currentTaskIndex]);
  const totalCount = taskQueue?.totalBeadCount ?? 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const formatTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ============================================================
  // 加载中 / 完成
  // ============================================================
  if (phase === 'loading') {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400 text-lg animate-pulse">加载中...</div></div>;
  }
  if (phase === 'finished') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold text-white mb-2">全部完成！</h1>
        <p className="text-gray-400 text-lg mb-6">共完成 {totalCount} 个豆子</p>
        <p className="text-gray-300 text-xl font-mono mb-8">用时 {formatTime(elapsedSeconds)}</p>
        <button onClick={() => { window.location.href = '/'; }}
          className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-semibold rounded-xl
                     hover:from-emerald-600 hover:to-cyan-700 transition-all shadow-lg">返回主页</button>
      </div>
    );
  }

  // ============================================================
  // 主界面
  // ============================================================
  const showOverlay = phase === 'idle' || phase === 'countdown';

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col select-none">
      {/* ===== 顶栏：仅返回 + 进度数字 ===== */}
      <header className="shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button onClick={() => { window.history.back(); }}
          className="text-gray-400 hover:text-white text-base transition-colors">← 返回</button>
        <span className="text-3xl font-bold text-white tabular-nums">
          {completedCount}<span className="text-gray-500 text-xl font-normal"> / {totalCount}</span>
        </span>
        <div className="w-14" /> {/* 占位保持居中 */}
      </header>

      {/* ===== 主体：左(进度+计时) + 画布 + 右(坐标→色号一一对应) ===== */}
      <div className="flex-1 flex min-h-0 p-2 gap-2">

        {/* 左面板：进度 + 计时 */}
        <div className="shrink-0 flex flex-col gap-3" style={{ width: '150px' }}>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-base text-gray-400 mb-1">进度</div>
            <div className="text-3xl font-bold text-white tabular-nums leading-tight">
              {completedCount}<span className="text-gray-500 text-xl font-normal">/{totalCount}</span>
            </div>
            <div className="bg-gray-700 rounded-full h-4 mt-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }} />
            </div>
            <div className="text-right text-base text-gray-400 mt-1 tabular-nums">{progressPct}%</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
            <div className="text-base text-gray-400 mb-1">计时</div>
            <div className="text-3xl font-bold text-white font-mono tabular-nums">{formatTime(elapsedSeconds)}</div>
          </div>
        </div>

        {/* 画布 */}
        <div className="relative flex-1 min-w-0">
          <FocusCanvas
            mappedPixelData={mappedPixelData} gridDimensions={gridDimensions}
            currentTask={currentTask} completedKeys={completedKeys}
            canvasScale={canvasScale} canvasOffset={canvasOffset}
            onScaleChange={setCanvasScale} onOffsetChange={setCanvasOffset}
            onAdvanceTask={handleAdvanceTask}
          />
          {showOverlay && (
            <FocusStartOverlay phase={phase === 'idle' ? 'idle' : 'countdown'} countdown={countdown} onStart={handleStart} />
          )}
        </div>

        {/* 右面板：坐标 + 色号 一一对应 */}
        {currentTask && (
          <div className="shrink-0 bg-gray-800 rounded-xl p-3 border border-gray-700 overflow-y-auto" style={{ width: '175px' }}>
            <div className="text-base text-gray-400 mb-2 flex items-center justify-between">
              <span>{currentTask.phase === 'border' ? '边框' : '填充'} #{currentTask.id}</span>
              <span className="text-gray-500">{currentTask.coordinates.length}豆</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {currentTask.coordinates.map((coord, i) => {
                const displayRow = (gridDimensions?.M ?? 0) - coord.row;
                const displayCol = coord.col + 1;
                const hex = currentTask.colors[i];
                const colorKey = getColorKeyByHex(hex, selectedColorSystem);
                return (
                  <div key={i}
                    className="flex items-center justify-between gap-2 px-2.5 py-2.5 text-base font-mono font-bold
                               bg-gray-700 rounded-lg border border-gray-600"
                  >
                    <span className="text-amber-300">({displayRow},{displayCol})</span>
                    <span className="flex items-center gap-1.5 text-gray-200">
                      <span className="inline-block w-5 h-5 rounded border border-gray-500 shrink-0"
                        style={{ backgroundColor: hex }} />
                      {colorKey}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ===== 底部提示 ===== */}
      {phase === 'playing' && currentTask && (
        <div className="shrink-0 text-center text-gray-500 text-xs py-2 border-t border-gray-800">
          点击图纸上高亮区域外的任意位置 → 标记本组完成
        </div>
      )}
    </div>
  );
}
