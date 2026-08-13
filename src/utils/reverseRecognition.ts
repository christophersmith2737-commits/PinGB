/**
 * 逆向拼豆图纸识别 — 网格几何计算 & 颜色采样
 *
 * 用户手动标定 X/Y 轴后，软件自动建立 N×M 网格、逐格采样、
 * 通过 CIELAB 色差映射到拼豆色库。
 */

import {
  RgbColor,
  PaletteColor,
  MappedPixel,
  findClosestPaletteColor,
} from './pixelation';
import { transparentColorData } from './pixelEditingUtils';

// ── 类型 ──

/** 轴标定参数（图片像素坐标系） */
export interface AxisParams {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  count: number; // 该方向格子数量
}

/** 单个格子的几何信息 */
export interface CellGeometry {
  col: number;
  row: number;
  /** 格子左上角在图片中的 X */
  x: number;
  /** 格子左上角在图片中的 Y */
  y: number;
  /** 格子宽度（= cellSize） */
  w: number;
  /** 格子高度（= cellSize） */
  h: number;
  /** 采样中心点 X */
  cx: number;
  /** 采样中心点 Y */
  cy: number;
}

// ── 几何计算 ──

/** 线段像素长度 */
function segmentLength(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 计算单个格子尺寸 */
export function computeCellSize(xAxis: AxisParams): number {
  const len = segmentLength(xAxis.startX, xAxis.startY, xAxis.endX, xAxis.endY);
  return len / xAxis.count;
}

/**
 * X 轴单位方向向量
 */
export function xAxisDirection(xAxis: AxisParams): { dx: number; dy: number } {
  const len = segmentLength(xAxis.startX, xAxis.startY, xAxis.endX, xAxis.endY);
  if (len === 0) return { dx: 1, dy: 0 };
  return {
    dx: (xAxis.endX - xAxis.startX) / len,
    dy: (xAxis.endY - xAxis.startY) / len,
  };
}

/**
 * Y 轴方向：由用户拖拽的 Y 轴终点决定。
 * 若未提供终点，默认取 X 轴方向逆时针旋转 90°（屏幕坐标系中向上）。
 */
export function yAxisDirection(
  xAxis: AxisParams,
  yEndX?: number,
  yEndY?: number,
): { dx: number; dy: number } {
  const xDir = xAxisDirection(xAxis);
  // 默认：X 方向逆时针 90°
  let dx = -xDir.dy;
  let dy = xDir.dx;
  if (yEndX !== undefined && yEndY !== undefined) {
    const len = segmentLength(xAxis.endX, xAxis.endY, yEndX, yEndY);
    if (len > 1) {
      dx = (yEndX - xAxis.endX) / len;
      dy = (yEndY - xAxis.endY) / len;
    }
  }
  return { dx, dy };
}

/**
 * 根据 X/Y 轴参数和当前行列数，生成所有格子的几何信息。
 *
 * 坐标系约定：
 * - cell(0,0) 的左上角 = (xAxis.startX, xAxis.startY)
 * - 列方向 = X 轴方向
 * - 行方向 = Y 轴方向（用户拖拽决定，默认垂直向上）
 * - 支持负的行列号（扩展网格用）
 */
export function generateGridGeometry(
  xAxis: AxisParams,
  yCount: number,
  colStart: number,
  colEnd: number,
  rowStart: number,
  rowEnd: number,
  yEndX?: number,
  yEndY?: number,
): CellGeometry[] {
  // X 方向单格宽度 = X 轴长度 / 格子数
  const cellW = computeCellSize(xAxis);
  // Y 方向单格高度 = Y 轴实际长度 / 格子数（允许矩形格，与 X 轴标定逻辑一致）
  let cellH = cellW;
  if (yEndX !== undefined && yEndY !== undefined) {
    const yLen = segmentLength(xAxis.endX, xAxis.endY, yEndX, yEndY);
    if (yLen > 0 && yCount > 0) {
      cellH = yLen / yCount;
    }
  }
  const xDir = xAxisDirection(xAxis);
  const yDir = yAxisDirection(xAxis, yEndX, yEndY);
  const cells: CellGeometry[] = [];

  for (let row = rowStart; row < rowEnd; row++) {
    for (let col = colStart; col < colEnd; col++) {
      // 格子左上角
      const x = xAxis.startX + col * cellW * xDir.dx + row * cellH * yDir.dx;
      const y = xAxis.startY + col * cellW * xDir.dy + row * cellH * yDir.dy;
      // 中心点
      const cx = x + cellW * 0.5 * xDir.dx + cellH * 0.5 * yDir.dx;
      const cy = y + cellW * 0.5 * xDir.dy + cellH * 0.5 * yDir.dy;

      cells.push({ col, row, x, y, w: cellW, h: cellH, cx, cy });
    }
  }
  return cells;
}

/** 初始网格（col 0..N-1, row 0..M-1） */
export function generateInitialGrid(
  xAxis: AxisParams,
  yCount: number,
  yEndX?: number,
  yEndY?: number,
): CellGeometry[] {
  return generateGridGeometry(xAxis, yCount, 0, xAxis.count, 0, yCount, yEndX, yEndY);
}

// ── 网格扩展 ──

export type ExtendDirection = 'up' | 'down' | 'left' | 'right';

/**
 * 在当前网格参数基础上，按方向增加一行/列。
 * 返回新的 { colStart, colEnd, rowStart, rowEnd }。
 * 不修改已有格子的坐标。
 */
export function extendGridBounds(
  colStart: number,
  colEnd: number,
  rowStart: number,
  rowEnd: number,
  direction: ExtendDirection,
): { colStart: number; colEnd: number; rowStart: number; rowEnd: number } {
  switch (direction) {
    case 'up':
      return { colStart, colEnd, rowStart: rowStart - 1, rowEnd };
    case 'down':
      return { colStart, colEnd, rowStart, rowEnd: rowEnd + 1 };
    case 'left':
      return { colStart: colStart - 1, colEnd, rowStart, rowEnd };
    case 'right':
      return { colStart, colEnd: colEnd + 1, rowStart, rowEnd };
  }
}

// ── 颜色采样 ──

/** 读取单点 RGB（ImageData 数组版，比逐点 getImageData 快得多） */
function readPixel(
  imageData: ImageData,
  x: number,
  y: number,
): RgbColor | null {
  const w = imageData.width;
  const h = imageData.height;
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null;
  const index = (yi * w + xi) * 4;
  if (imageData.data[index + 3] < 128) return null; // 透明
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
  };
}

/**
 * 中心点采样：读取格子中心点的 RGB。
 * V1 默认采样方式。
 */
export function sampleCenterPoint(
  imageData: ImageData,
  geo: CellGeometry,
): RgbColor | null {
  return readPixel(imageData, geo.cx, geo.cy);
}

/**
 * 五点采样：返回 5 个采样点的原始 RGB，顺序为 [中心, 上, 下, 左, 右]。
 * 偏移约 22% 格子边长：左右按格宽、上下按格高（矩形格各自适配）。
 * 每个点各自映射色号后投票（投票逻辑在调用方）。
 */
export function sampleFivePoints(
  imageData: ImageData,
  geo: CellGeometry,
): (RgbColor | null)[] {
  const cx = geo.cx;
  const cy = geo.cy;
  const offsetX = Math.max(1, Math.round(geo.w * 0.22));
  const offsetY = Math.max(1, Math.round(geo.h * 0.22));

  const points: { x: number; y: number }[] = [
    { x: cx, y: cy },              // 中心
    { x: cx, y: cy - offsetY },    // 上
    { x: cx, y: cy + offsetY },    // 下
    { x: cx - offsetX, y: cy },    // 左
    { x: cx + offsetX, y: cy },    // 右
  ];

  return points.map(pt => readPixel(imageData, pt.x, pt.y));
}

/**
 * 九点采样：返回 9 个采样点的原始 RGB，
 * 顺序为 [中心, 上, 下, 左, 右, 左上, 右上, 左下, 右下]。
 * 偏移约 22% 格子边长（同五点采样）。
 * 每个点各自映射色号后投票（中心 5 票，其余 8 点各 2 票，共 21 票）。
 */
export function sampleNinePoints(
  imageData: ImageData,
  geo: CellGeometry,
): (RgbColor | null)[] {
  const cx = geo.cx;
  const cy = geo.cy;
  const offsetX = Math.max(1, Math.round(geo.w * 0.22));
  const offsetY = Math.max(1, Math.round(geo.h * 0.22));

  const points: { x: number; y: number }[] = [
    { x: cx, y: cy },                         // 中心（5 票）
    { x: cx, y: cy - offsetY },               // 上
    { x: cx, y: cy + offsetY },               // 下
    { x: cx - offsetX, y: cy },               // 左
    { x: cx + offsetX, y: cy },               // 右
    { x: cx - offsetX, y: cy - offsetY },     // 左上
    { x: cx + offsetX, y: cy - offsetY },     // 右上
    { x: cx - offsetX, y: cy + offsetY },     // 左下
    { x: cx + offsetX, y: cy + offsetY },     // 右下
  ];

  return points.map(pt => readPixel(imageData, pt.x, pt.y));
}

// ── 构建拼豆矩阵 ──

export type SamplingFn = (
  imageData: ImageData,
  geo: CellGeometry,
) => RgbColor | null;

/**
 * 对所有格子逐格采样 → CIELAB 色差映射 → 组装 N×M 的 MappedPixel 矩阵。
 *
 * @param imageData 原始图片的完整像素数据（一次性读取）
 * @param geometries 所有格子的几何信息
 * @param N 列数
 * @param M 行数
 * @param palette 当前激活的拼豆色板
 * @param sampleFn 采样函数（centerPoint 或 fivePointWeighted）
 * @param onProgress 进度回调 (0–1)
 */
export function buildMappedPixelGrid(
  imageData: ImageData,
  geometries: CellGeometry[],
  N: number,
  M: number,
  palette: PaletteColor[],
  sampleFn: SamplingFn,
  onProgress?: (ratio: number) => void,
): MappedPixel[][] {
  const grid = Array.from({ length: M }, () =>
    Array.from({ length: N }, () => ({ ...transparentColorData })),
  );

  let processed = 0;
  const total = geometries.length;

  for (const geo of geometries) {
    const rgb = sampleFn(imageData, geo);
    if (rgb) {
      const closest = findClosestPaletteColor(rgb, palette);
      grid[geo.row][geo.col] = {
        key: closest.key,
        color: closest.hex,
        isExternal: false,
      };
    }
    processed++;
    if (onProgress && processed % 50 === 0) {
      onProgress(processed / total);
    }
  }

  if (onProgress) onProgress(1);
  return grid;
}
