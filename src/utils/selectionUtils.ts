/**
 * 选择工具 — 圆形笔刷格子求交、选择遮罩集合操作
 */

/** 格子坐标 */
export interface GridCell {
  row: number;
  col: number;
}

/** Selection mask key 格式 "row,col" */
export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function parseCellKey(key: string): GridCell {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
}

/**
 * 计算圆形笔刷覆盖的所有网格单元格
 *
 * @param canvasX 鼠标在 canvas 坐标系中的 X
 * @param canvasY 鼠标在 canvas 坐标系中的 Y
 * @param canvasWidth canvas 元素宽度
 * @param canvasHeight canvas 元素高度
 * @param N 横向格子数
 * @param M 纵向格子数
 * @param radius 笔刷半径（格子单位）
 * @returns 笔刷覆盖的格子坐标数组
 */
export function getCellsInBrush(
  canvasX: number,
  canvasY: number,
  canvasWidth: number,
  canvasHeight: number,
  N: number,
  M: number,
  radius: number
): GridCell[] {
  const cellW = canvasWidth / N;
  const cellH = canvasHeight / M;

  // 笔刷中心所在的格子
  const centerCol = Math.floor(canvasX / cellW);
  const centerRow = Math.floor(canvasY / cellH);

  // 笔刷覆盖的格子范围（用格子单位做方形包围盒）
  const minCol = Math.max(0, centerCol - Math.ceil(radius));
  const maxCol = Math.min(N - 1, centerCol + Math.ceil(radius));
  const minRow = Math.max(0, centerRow - Math.ceil(radius));
  const maxRow = Math.min(M - 1, centerRow + Math.ceil(radius));

  const cells: GridCell[] = [];

  // 笔刷圆心（canvas 坐标系）
  const brushCenterX = canvasX;
  const brushCenterY = canvasY;

  // 半径（canvas 像素单位）
  const radiusPx = radius * Math.max(cellW, cellH);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      // 格子中心坐标
      const cellCenterX = (col + 0.5) * cellW;
      const cellCenterY = (row + 0.5) * cellH;

      // 格子中心到笔刷中心的距离
      const dx = cellCenterX - brushCenterX;
      const dy = cellCenterY - brushCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radiusPx) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
}

/**
 * 将 client 坐标转为 canvas 坐标
 */
export function clientToCanvasCoords(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/**
 * 给 selectionMask 批量添加格子
 * @returns 新的 Set（不可变更新）
 */
export function addCellsToMask(
  mask: Set<string>,
  cells: GridCell[]
): Set<string> {
  const next = new Set(mask);
  for (const { row, col } of cells) {
    next.add(cellKey(row, col));
  }
  return next;
}

/**
 * 清除 selectionMask（新选择时不保留旧选区）
 */
export function clearMask(): Set<string> {
  return new Set();
}
