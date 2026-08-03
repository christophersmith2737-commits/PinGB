'use client';

import React from 'react';
import { TaskItem } from '../utils/taskQueueGenerator';
import { ColorSystem, getColorKeyByHex } from '../utils/colorSystemUtils';

interface FocusTaskPanelProps {
  currentTask: TaskItem | null;
  selectedColorSystem: ColorSystem;
  gridM: number;
  /** 已完成 / 总数 */
  completedCount: number;
  totalCount: number;
}

const FocusTaskPanel: React.FC<FocusTaskPanelProps> = ({
  currentTask,
  selectedColorSystem,
  gridM,
  completedCount,
  totalCount,
}) => {
  if (!currentTask) return null;

  const { coordinates, colors, id, phase } = currentTask;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex gap-3">
      {/* ===== 左栏：进度 + 坐标 ===== */}
      <div className="shrink-0 flex flex-col gap-2" style={{ width: '110px' }}>
        {/* 进度模块 */}
        <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">进度</div>
          <div className="text-lg font-bold text-white tabular-nums leading-tight">
            {completedCount}<span className="text-gray-500 text-sm font-normal">/{totalCount}</span>
          </div>
          <div className="bg-gray-700 rounded-full h-2 mt-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="text-right text-xs text-gray-500 mt-0.5 tabular-nums">{progressPct}%</div>
        </div>

        {/* 坐标列表 */}
        <div className="bg-gray-800 rounded-lg p-2 border border-gray-700 flex-1 overflow-y-auto">
          <div className="text-xs text-gray-400 mb-1">
            {phase === 'border' ? '边框' : '填充'} #{id}
          </div>
          <div className="flex flex-col gap-1">
            {coordinates.map((coord, i) => {
              const displayRow = gridM - coord.row;
              const displayCol = coord.col + 1;
              return (
                <span
                  key={i}
                  className="block text-center px-1.5 py-1 text-sm font-mono font-bold
                             bg-gray-700 text-amber-300 rounded border border-gray-600"
                >
                  ({displayRow},{displayCol})
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 中：画布留给父组件 ===== */}

      {/* ===== 右栏：色块列表 ===== */}
      <div className="shrink-0 flex flex-col gap-2" style={{ width: '95px' }}>
        {/* 任务信息 */}
        <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">任务</div>
          <div className="text-lg font-bold text-white tabular-nums leading-tight">
            {coordinates.length}<span className="text-gray-500 text-sm font-normal"> 豆</span>
          </div>
        </div>

        {/* 色块列表 */}
        <div className="bg-gray-800 rounded-lg p-2 border border-gray-700 flex-1 overflow-y-auto">
          <div className="text-xs text-gray-400 mb-1">色号</div>
          <div className="flex flex-col gap-1">
            {colors.map((hex, i) => {
              const colorKey = getColorKeyByHex(hex, selectedColorSystem);
              return (
                <span
                  key={i}
                  className="flex items-center gap-1.5 px-1.5 py-1 text-sm font-mono font-bold
                             bg-gray-700 text-gray-200 rounded border border-gray-600"
                >
                  <span
                    className="inline-block w-4 h-4 rounded-sm border border-gray-500 shrink-0"
                    style={{ backgroundColor: hex }}
                  />
                  {colorKey}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusTaskPanel;
