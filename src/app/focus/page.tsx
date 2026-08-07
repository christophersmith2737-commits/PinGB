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
  // 撤销历史栈：每个条目记录 taskIndex 和该任务新增的坐标 key
  const [taskHistory, setTaskHistory] = useState<{ taskIndex: number; coordKeys: string[] }[]>([]);

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

    // 记录当前任务的坐标 key，用于撤销
    const coordKeys = currentTask.coordinates.map(c => `${c.row},${c.col}`);

    const newCompletedKeys = new Set(completedKeys);
    let newCompletedCount = completedCount;
    for (const k of coordKeys) {
      if (!newCompletedKeys.has(k)) { newCompletedKeys.add(k); newCompletedCount++; }
    }
    setCompletedKeys(newCompletedKeys);
    setCompletedCount(newCompletedCount);

    // 推入撤销历史
    setTaskHistory(prev => [...prev, { taskIndex: currentTaskIndex, coordKeys }]);

    const nextIndex = currentTaskIndex + 1;
    if (nextIndex >= taskQueue.tasks.length) { setTimerRunning(false); setPhase('finished'); }
    else { setCurrentTaskIndex(nextIndex); }
  }, [taskQueue, currentTaskIndex, phase, completedKeys, completedCount]);

  // ============================================================
  // 撤销
  // ============================================================
  const handleUndoTask = useCallback(() => {
    if (!taskQueue || phase !== 'playing') return;
    setTaskHistory(prev => {
      if (prev.length === 0) return prev;
      const lastEntry = prev[prev.length - 1];

      // 移除该任务新增的已完成坐标
      setCompletedKeys(prevKeys => {
        const next = new Set(prevKeys);
        for (const k of lastEntry.coordKeys) {
          next.delete(k);
        }
        return next;
      });
      setCompletedCount(prevCount => prevCount - lastEntry.coordKeys.length);

      // 回到该任务
      setCurrentTaskIndex(lastEntry.taskIndex);

      return prev.slice(0, -1);
    });
  }, [taskQueue, phase]);

  // ============================================================
  // 派生
  // ============================================================
  const currentTask: TaskItem | null = useMemo(() => {
    if (!taskQueue || currentTaskIndex >= taskQueue.tasks.length) return null;
    return taskQueue.tasks[currentTaskIndex];
  }, [taskQueue, currentTaskIndex]);
  const totalCount = taskQueue?.totalBeadCount ?? 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // 画布是否偏离初始位置
  const isCanvasMisaligned = canvasOffset.x !== 0 || canvasOffset.y !== 0;
  const handleResetView = useCallback(() => {
    setCanvasOffset({ x: 0, y: 0 });
  }, []);

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

  // 任务项渲染（复用）
  const renderTaskItem = (coord: {row: number; col: number}, i: number, hex: string) => {
    const displayCol = coord.col + 1;
    const displayRow = (gridDimensions?.M ?? 0) - coord.row;
    const colorKey = getColorKeyByHex(hex, selectedColorSystem);
    return (
      <div key={i}
        className="flex items-center gap-1.5 px-2 py-1.5 text-sm md:text-base font-mono font-bold
                   bg-gray-700 rounded-lg border border-gray-600 shrink-0"
      >
        <span className="text-amber-300 whitespace-nowrap">({displayCol},{displayRow})</span>
        <span className="flex items-center gap-1 text-gray-200">
          <span className="inline-block w-4 h-4 md:w-5 md:h-5 rounded border border-gray-500 shrink-0"
            style={{ backgroundColor: hex }} />
          <span className="whitespace-nowrap">{colorKey}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="h-screen bg-gray-950 flex flex-col select-none overflow-hidden">
      {/* ===== 顶栏 ===== */}
      <header className="shrink-0 bg-gray-900 border-b border-gray-800 px-3 md:px-4 py-2 md:py-3 flex items-center justify-between">
        <button onClick={() => { window.history.back(); }}
          className="text-gray-400 hover:text-white text-sm md:text-base transition-colors">← 返回</button>
        <span className="text-xl md:text-3xl font-bold text-white tabular-nums">
          {completedCount}<span className="text-gray-500 text-base md:text-xl font-normal"> / {totalCount}</span>
        </span>
        <span className="md:hidden text-sm text-gray-400 font-mono tabular-nums">{formatTime(elapsedSeconds)}</span>
        <div className="hidden md:block w-14" />
      </header>

      {/* ===== 移动端：操作按钮 + 进度条 ===== */}
      <div className="md:hidden shrink-0 bg-gray-900 border-b border-gray-800 px-3 py-1.5 flex flex-col gap-1.5">
        {/* 下一组 / 撤销 按钮 */}
        {phase === 'playing' && (
          <div className="flex gap-2">
            <button
              onClick={handleAdvanceTask}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                         bg-gradient-to-r from-emerald-600 to-cyan-700 text-white font-semibold text-sm
                         active:scale-95 transition-all shadow-md"
            >
              <span className="text-base">⏭</span> 下一组
            </button>
            <button
              onClick={handleUndoTask}
              disabled={taskHistory.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                         bg-amber-700/60 text-amber-200 font-semibold text-sm border border-amber-600/40
                         active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100"
            >
              <span className="text-base">↩</span> 撤销
            </button>
          </div>
        )}
        {/* 进度条 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 tabular-nums w-8">{progressPct}%</span>
          <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* ===== 主体 ===== */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 p-2 gap-2 overflow-hidden">

        {/* 左面板：进度 + 计时（仅桌面端） */}
        <div className="hidden md:flex shrink-0 flex-col gap-3" style={{ width: '150px' }}>
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
          {/* 下一组 & 撤销按钮 */}
          {phase === 'playing' && (
            <>
              <button
                onClick={handleAdvanceTask}
                className="bg-gray-800 rounded-xl p-3 border border-emerald-600 text-center
                           hover:bg-emerald-900/30 hover:border-emerald-500 active:scale-95 transition-all"
                title="下一组"
              >
                <div className="text-2xl">→</div>
                <div className="text-xs text-emerald-400 font-medium mt-0.5">下一组</div>
              </button>
              <button
                onClick={handleUndoTask}
                disabled={taskHistory.length === 0}
                className="bg-gray-800 rounded-xl p-3 border border-amber-600 text-center
                           hover:bg-amber-900/30 hover:border-amber-500 active:scale-95 transition-all
                           disabled:opacity-30 disabled:cursor-not-allowed"
                title="撤销"
              >
                <div className="text-2xl">↩</div>
                <div className="text-xs text-amber-400 font-medium mt-0.5">撤销</div>
              </button>
            </>
          )}
          {/* 桌面端：画布归位按钮 */}
          {isCanvasMisaligned && (
            <button
              onClick={handleResetView}
              className="bg-gray-800 rounded-xl p-3 border border-amber-600 text-center hover:bg-gray-700 transition-colors"
            >
              <div className="text-2xl mb-1">↺</div>
              <div className="text-xs text-amber-400 font-medium">复位视图</div>
            </button>
          )}
        </div>

        {/* 画布 — 移动端占满剩余空间 */}
        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden rounded-xl">
          <FocusCanvas
            mappedPixelData={mappedPixelData} gridDimensions={gridDimensions}
            currentTask={currentTask} completedKeys={completedKeys}
            canvasScale={canvasScale} canvasOffset={canvasOffset}
            onScaleChange={setCanvasScale} onOffsetChange={setCanvasOffset}
          />
          {showOverlay && (
            <FocusStartOverlay phase={phase === 'idle' ? 'idle' : 'countdown'} countdown={countdown} onStart={handleStart} />
          )}
          {/* 移动端：浮动归位按钮 */}
          {isCanvasMisaligned && (
            <button
              onClick={handleResetView}
              className="md:hidden absolute top-2 right-2 z-40 w-10 h-10 rounded-full bg-gray-800/90 border border-amber-500
                         flex items-center justify-center text-amber-400 text-lg shadow-lg
                         hover:bg-gray-700 active:scale-95 transition-all"
              title="复位视图"
            >
              ↺
            </button>
          )}
        </div>

        {/* 右面板（仅桌面端） */}
        {currentTask && (
          <div className="hidden md:block shrink-0 bg-gray-800 rounded-xl p-3 border border-gray-700 overflow-y-auto" style={{ width: '175px' }}>
            <div className="text-base text-gray-400 mb-2 flex items-center justify-between">
              <span>{currentTask.phase === 'border' ? '边框' : '填充'} #{currentTask.id}</span>
              <span className="text-gray-500 text-xs">(列,行)</span>
              <span className="text-gray-500">{currentTask.coordinates.length}豆</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {currentTask.coordinates.map((coord, i) => renderTaskItem(coord, i, currentTask.colors[i]))}
            </div>
          </div>
        )}
      </div>

      {/* ===== 移动端底部任务面板 — 3列×5行 ===== */}
      {currentTask && (
        <div className="md:hidden shrink-0 bg-gray-800 border-t border-gray-700 px-2 py-1.5">
          <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>{currentTask.phase === 'border' ? '边框' : '填充'} #{currentTask.id}</span>
            <span className="text-gray-500 text-xs">(列,行)</span>
            <span className="text-gray-500">{currentTask.coordinates.length}豆</span>
          </div>
          <div className="grid gap-1 overflow-y-auto content-start" style={{
            gridTemplateColumns: 'repeat(3, 1fr)',
            maxHeight: '12rem',
          }}>
            {currentTask.coordinates.map((coord, i) => renderTaskItem(coord, i, currentTask.colors[i]))}
          </div>
        </div>
      )}

    </div>
  );
}
