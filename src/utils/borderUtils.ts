import { MappedPixel } from './pixelation';

/**
 * 添加外部轮廓边框
 * 从网格四边洪水填充标记"外部背景"，然后将所有与外部背景相邻的非透明像素改为边框颜色。
 * 内部镂空区域不会被触及。
 */
export function addOuterBorder(
  pixelData: MappedPixel[][],
  gridDimensions: { N: number; M: number },
  borderColor: MappedPixel
): MappedPixel[][] {
  const { N, M } = gridDimensions;
  const newPixelData = pixelData.map(row => row.map(cell => ({ ...cell })));

  // Step 1: 从四边 BFS 洪水填充，标记"外部背景"
  const outerBg = Array.from({ length: M }, () => Array(N).fill(false));
  const visited = Array.from({ length: M }, () => Array(N).fill(false));
  const queue: { row: number; col: number }[] = [];

  // 四边种子入队
  for (let i = 0; i < N; i++) {
    if (newPixelData[0][i]?.isExternal) {
      queue.push({ row: 0, col: i });
      visited[0][i] = true;
    }
    if (newPixelData[M - 1][i]?.isExternal) {
      queue.push({ row: M - 1, col: i });
      visited[M - 1][i] = true;
    }
  }
  for (let j = 0; j < M; j++) {
    if (newPixelData[j][0]?.isExternal) {
      queue.push({ row: j, col: 0 });
      visited[j][0] = true;
    }
    if (newPixelData[j][N - 1]?.isExternal) {
      queue.push({ row: j, col: N - 1 });
      visited[j][N - 1] = true;
    }
  }

  // BFS
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let head = 0;
  while (head < queue.length) {
    const { row, col } = queue[head++];
    outerBg[row][col] = true;

    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < M && nc >= 0 && nc < N &&
          !visited[nr][nc] && newPixelData[nr][nc]?.isExternal) {
        visited[nr][nc] = true;
        queue.push({ row: nr, col: nc });
      }
    }
  }

  // Step 2: 与外部背景相邻的非透明像素 → 改为边框颜色
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      if (newPixelData[j][i].isExternal) continue;

      for (const [dr, dc] of dirs) {
        const nr = j + dr;
        const nc = i + dc;
        if (nr >= 0 && nr < M && nc >= 0 && nc < N && outerBg[nr][nc]) {
          newPixelData[j][i] = { ...borderColor };
          break;
        }
      }
    }
  }

  return newPixelData;
}
