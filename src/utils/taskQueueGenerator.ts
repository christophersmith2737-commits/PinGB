import { MappedPixel } from './pixelation';

// ============================================================
// 任务队列类型定义
// ============================================================

export interface TaskCoordinate {
  row: number;
  col: number;
}

export interface TaskItem {
  id: number;
  coordinates: TaskCoordinate[];   // 该任务包含的格子坐标
  colors: string[];                 // 对应颜色 hex，与 coordinates 一一对应
  phase: 'border' | 'interior';
  completed: boolean;
  createdAt: number;
}

export interface TaskQueue {
  tasks: TaskItem[];
  totalBeadCount: number; // 总有效豆子数（不含 isExternal）
}

// ============================================================
// 辅助函数
// ============================================================

const NEIGHBORS_8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function key(row: number, col: number): string {
  return `${row},${col}`;
}

function parseKey(k: string): { row: number; col: number } {
  const [r, c] = k.split(',').map(Number);
  return { row: r, col: c };
}

function isAdjacent(a: TaskCoordinate, b: TaskCoordinate): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr <= 1 && dc <= 1 && (dr + dc > 0);
}

/** 判断某个有效格子是否为边框像素（8邻域中有外部/透明像素或越界） */
function isPixelOnBorder(
  row: number,
  col: number,
  data: MappedPixel[][],
  M: number,
  N: number,
): boolean {
  if (data[row][col].isExternal) return false;
  for (const [dr, dc] of NEIGHBORS_8) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr < 0 || nr >= M || nc < 0 || nc >= N) return true;
    if (data[nr][nc].isExternal) return true;
  }
  return false;
}

// ============================================================
// Step 1: 边框检测 — 找到所有边框像素
// ============================================================

function findAllBorderPixels(
  data: MappedPixel[][],
  M: number,
  N: number,
): Set<string> {
  const borderSet = new Set<string>();
  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      if (isPixelOnBorder(row, col, data, M, N)) {
        borderSet.add(key(row, col));
      }
    }
  }
  return borderSet;
}

// ============================================================
// Step 2: 轮廓追踪 — 沿着边框顺序遍历
// ============================================================

/**
 * 贪心最近邻轮廓追踪：
 * 从随机起始点开始，每次选取最近的未访问边框像素，
 * 自然沿轮廓推进。适用于任意形状的边框。
 */
function traceBorderContour(
  borderSet: Set<string>,
): TaskCoordinate[] {
  if (borderSet.size === 0) return [];

  const unvisited = new Set(borderSet);
  const contour: TaskCoordinate[] = [];

  // 随机起始点
  const arr = Array.from(unvisited);
  const start = parseKey(arr[Math.floor(Math.random() * arr.length)]);
  unvisited.delete(key(start.row, start.col));
  contour.push(start);

  let current = start;

  while (unvisited.size > 0) {
    // 在所有未访问的边框像素中，找距离 current 最近的一个
    let best: TaskCoordinate | null = null;
    let bestDist = Infinity;

    for (const k of unvisited) {
      const p = parseKey(k);
      const dist = Math.abs(p.row - current.row) + Math.abs(p.col - current.col);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
        if (dist <= 1) break; // 已找到相邻的，不必继续
      }
    }

    if (!best) break;

    unvisited.delete(key(best.row, best.col));
    contour.push(best);
    current = best;

    // 闭合检测：如果当前点与起始点相邻，且已覆盖大部分边框像素
    if (isAdjacent(current, start) && unvisited.size < borderSet.size * 0.3) {
      // 但仍需检查是否还有离当前很近的未访问点
      let nearbyUnvisited = false;
      for (const k of unvisited) {
        const p = parseKey(k);
        if (Math.abs(p.row - current.row) + Math.abs(p.col - current.col) <= 2) {
          nearbyUnvisited = true;
          break;
        }
      }
      if (!nearbyUnvisited) break;
    }
  }

  return contour;
}

// ============================================================
// Step 3: 生成边框阶段任务
// ============================================================

function generateBorderTasks(
  contour: TaskCoordinate[],
  data: MappedPixel[][],
  startId: number,
): { tasks: TaskItem[]; completedKeys: Set<string> } {
  const tasks: TaskItem[] = [];
  const MAX_PER_TASK = 12;
  const completedKeys = new Set<string>();

  let taskId = startId;
  for (let i = 0; i < contour.length; i += MAX_PER_TASK) {
    const chunk = contour.slice(i, Math.min(i + MAX_PER_TASK, contour.length));
    const coordinates: TaskCoordinate[] = [];
    const colors: string[] = [];

    for (const coord of chunk) {
      coordinates.push(coord);
      colors.push(data[coord.row][coord.col].color);
      completedKeys.add(key(coord.row, coord.col));
    }

    tasks.push({
      id: taskId++,
      coordinates,
      colors,
      phase: 'border',
      completed: false,
      createdAt: Date.now(),
    });
  }

  return { tasks, completedKeys };
}

// ============================================================
// Step 4: 内部区域颜色统计
// ============================================================

interface ColorGroup {
  color: string;       // hex
  count: number;
  cells: TaskCoordinate[];
}

function groupInteriorByColor(
  data: MappedPixel[][],
  M: number,
  N: number,
  completedKeys: Set<string>,
): ColorGroup[] {
  const colorMap = new Map<string, TaskCoordinate[]>();

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      if (data[row][col].isExternal) continue;
      if (completedKeys.has(key(row, col))) continue;

      const hex = data[row][col].color;
      if (!colorMap.has(hex)) {
        colorMap.set(hex, []);
      }
      colorMap.get(hex)!.push({ row, col });
    }
  }

  const groups: ColorGroup[] = [];
  for (const [color, cells] of colorMap) {
    groups.push({ color, count: cells.length, cells });
  }

  // 按数量升序（最少优先）
  groups.sort((a, b) => a.count - b.count);

  return groups;
}

// ============================================================
// Step 5: 内部区域任务生成
//   大块连通区域 → 按行+两列扫描（符合实操习惯）
//   小块/散点 → BFS 就近连通凑满 15
//   最后剩余散点 → 贪心就近收尾
// ============================================================

const MAX_PER_TASK = 12;
/** 找连通区域（8方向 BFS） */
function findConnectedRegions(cells: TaskCoordinate[]): TaskCoordinate[][] {
  const cellSet = new Set(cells.map(c => key(c.row, c.col)));
  const visited = new Set<string>();
  const regions: TaskCoordinate[][] = [];

  for (const cell of cells) {
    const k = key(cell.row, cell.col);
    if (visited.has(k)) continue;

    const region: TaskCoordinate[] = [];
    const queue = [cell];
    visited.add(k);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      region.push(cur);

      for (const [dr, dc] of NEIGHBORS_8) {
        const nk = key(cur.row + dr, cur.col + dc);
        if (cellSet.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          const found = cells.find(c => c.row === cur.row + dr && c.col === cur.col + dc);
          if (found) queue.push(found);
        }
      }
    }

    regions.push(region);
  }

  // 按大小降序
  regions.sort((a, b) => b.length - a.length);
  return regions;
}

/** 条带扫描：按列对扫描，每对列内逐行取，每次最多15个 */
function stripeScanRegion(
  region: TaskCoordinate[],
  unvisited: Set<string>,
  cellMap: Map<string, TaskCoordinate>,
  startId: number,
  color: string,
): { tasks: TaskItem[]; completedKeys: Set<string> } {
  const tasks: TaskItem[] = [];
  const completedKeys = new Set<string>();
  let taskId = startId;

  // 按列分组
  const byCol = new Map<number, TaskCoordinate[]>();
  for (const c of region) {
    const k = key(c.row, c.col);
    if (!unvisited.has(k)) continue;
    if (!byCol.has(c.col)) byCol.set(c.col, []);
    byCol.get(c.col)!.push(c);
  }

  const cols = Array.from(byCol.keys()).sort((a, b) => a - b);

  // 两列一组扫描
  const chunk: TaskCoordinate[] = [];
  const flush = () => {
    if (chunk.length === 0) return;
    const coords: TaskCoordinate[] = [];
    const colors: string[] = [];
    for (const c of chunk) {
      coords.push(c);
      colors.push(color);
      completedKeys.add(key(c.row, c.col));
    }
    tasks.push({ id: taskId++, coordinates: coords, colors, phase: 'interior', completed: false, createdAt: Date.now() });
    chunk.length = 0;
  };

  for (let ci = 0; ci < cols.length; ci += 2) {
    const colA = cols[ci];
    const colB = ci + 1 < cols.length ? cols[ci + 1] : null;

    // 两列的所有行，去重排序
    const rowSet = new Set<number>();
    for (const c of byCol.get(colA)!) rowSet.add(c.row);
    if (colB !== null) for (const c of byCol.get(colB)!) rowSet.add(c.row);
    const rows = Array.from(rowSet).sort((a, b) => a - b);

    for (const row of rows) {
      for (const col of [colA, colB].filter(Boolean) as number[]) {
        const k = key(row, col);
        if (unvisited.has(k)) {
          const coord = cellMap.get(k)!;
          chunk.push(coord);
          unvisited.delete(k);
          if (chunk.length >= MAX_PER_TASK) flush();
        }
      }
    }
  }

  flush();
  return { tasks, completedKeys };
}

function generateInteriorTasksForColor(
  colorGroup: ColorGroup,
  _data: MappedPixel[][],
  startId: number,
): { tasks: TaskItem[]; completedKeys: Set<string> } {
  const allTasks: TaskItem[] = [];
  const allCompleted = new Set<string>();
  let taskId = startId;

  const cellMap = new Map<string, TaskCoordinate>();
  for (const cell of colorGroup.cells) {
    cellMap.set(key(cell.row, cell.col), cell);
  }

  const unvisited = new Set(cellMap.keys());
  const totalPixels = colorGroup.cells.length;

  // ---- 情况1：总数 ≤15，全贪心 ----
  if (totalPixels <= MAX_PER_TASK) {
    const result = greedyChunk(unvisited, cellMap, taskId, colorGroup.color, null);
    allTasks.push(...result.tasks);
    for (const k of result.completedKeys) allCompleted.add(k);
    return { tasks: allTasks, completedKeys: allCompleted };
  }

  // ---- 情况2：总数 >15，只条带扫描最大的连通区域，其余全贪心 ----
  const regions = findConnectedRegions(colorGroup.cells);
  // regions 已按大小降序排列，regions[0] 就是最集中的区域
  const mainRegion = regions[0];
  const mainRemaining = mainRegion.filter(c => unvisited.has(key(c.row, c.col)));

  let lastEndpoint: TaskCoordinate | null = null;

  if (mainRemaining.length > 0) {
    const result = stripeScanRegion(mainRemaining, unvisited, cellMap, taskId, colorGroup.color);
    allTasks.push(...result.tasks);
    for (const k of result.completedKeys) allCompleted.add(k);
    taskId += result.tasks.length;
    if (result.tasks.length > 0) {
      const last = result.tasks[result.tasks.length - 1];
      lastEndpoint = last.coordinates[last.coordinates.length - 1];
    }
  }

  // 剩余所有散点 — 全贪心分组（每次≤15，最后一组不管多少直接收完）
  if (unvisited.size > 0) {
    const final = greedyChunk(unvisited, cellMap, taskId, colorGroup.color, lastEndpoint);
    allTasks.push(...final.tasks);
    for (const k of final.completedKeys) allCompleted.add(k);
  }

  return { tasks: allTasks, completedKeys: allCompleted };
}

/** 贪心就近分块：每次取 ≤15 个 */
function greedyChunk(
  unvisited: Set<string>,
  cellMap: Map<string, TaskCoordinate>,
  startId: number,
  color: string,
  startEndpoint: TaskCoordinate | null,
): { tasks: TaskItem[]; completedKeys: Set<string> } {
  const tasks: TaskItem[] = [];
  const completedKeys = new Set<string>();
  let taskId = startId;
  let lastEndpoint = startEndpoint;

  while (unvisited.size > 0) {
    const chunk: TaskCoordinate[] = [];

    let currentKey: string;
    if (lastEndpoint) {
      let best: string | null = null;
      let bestDist = Infinity;
      for (const k of unvisited) {
        const p = parseKey(k);
        const dist = Math.abs(p.row - lastEndpoint.row) + Math.abs(p.col - lastEndpoint.col);
        if (dist < bestDist) { bestDist = dist; best = k; if (dist <= 1) break; }
      }
      currentKey = best!;
    } else {
      currentKey = unvisited.values().next().value!;
    }

    const firstCoord = cellMap.get(currentKey)!;
    chunk.push(firstCoord);
    unvisited.delete(currentKey);
    let cursor = firstCoord;

    while (chunk.length < MAX_PER_TASK && unvisited.size > 0) {
      let best: string | null = null;
      let bestDist = Infinity;
      for (const k of unvisited) {
        const p = parseKey(k);
        const dist = Math.abs(p.row - cursor.row) + Math.abs(p.col - cursor.col);
        if (dist < bestDist) { bestDist = dist; best = k; if (dist <= 1) break; }
      }
      if (!best) break;
      const coord = cellMap.get(best)!;
      chunk.push(coord);
      unvisited.delete(best);
      cursor = coord;
    }

    const coords: TaskCoordinate[] = [];
    const colors: string[] = [];
    for (const c of chunk) {
      coords.push(c);
      colors.push(color);
      completedKeys.add(key(c.row, c.col));
    }
    tasks.push({ id: taskId++, coordinates: coords, colors, phase: 'interior', completed: false, createdAt: Date.now() });
    lastEndpoint = chunk[chunk.length - 1];
  }

  return { tasks, completedKeys };
}

// ============================================================
// 主入口
// ============================================================

export function generateTaskQueue(
  mappedPixelData: MappedPixel[][],
  gridDimensions: { N: number; M: number },
): TaskQueue {
  const { N, M } = gridDimensions;
  const allTasks: TaskItem[] = [];
  const globalCompleted = new Set<string>();
  let nextTaskId = 1;
  let totalBeadCount = 0;

  // 统计总有效豆子数
  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      if (!mappedPixelData[row][col].isExternal) {
        totalBeadCount++;
      }
    }
  }

  // ===== 边框阶段 =====
  const borderSet = findAllBorderPixels(mappedPixelData, M, N);

  if (borderSet.size > 0) {
    const contour = traceBorderContour(borderSet);
    const { tasks: borderTasks, completedKeys } = generateBorderTasks(contour, mappedPixelData, nextTaskId);
    allTasks.push(...borderTasks);
    for (const k of completedKeys) globalCompleted.add(k);
    nextTaskId += borderTasks.length;
  }

  // ===== 内部阶段 =====
  const colorGroups = groupInteriorByColor(mappedPixelData, M, N, globalCompleted);

  for (const group of colorGroups) {
    const { tasks: interiorTasks, completedKeys } = generateInteriorTasksForColor(
      group,
      mappedPixelData,
      nextTaskId,
    );
    allTasks.push(...interiorTasks);
    for (const k of completedKeys) globalCompleted.add(k);
    nextTaskId += interiorTasks.length;
  }

  return {
    tasks: allTasks,
    totalBeadCount,
  };
}
