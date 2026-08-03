/**
 * 粒子系统 — 种子的伪随机数、粒子生成、物理更新、动画循环
 *
 * 用于"逝去"消散效果：将选中的拼豆格子转换为彩色粒子，沿指定角度飘散。
 */

import { MappedPixel } from './pixelation';
import { parseCellKey } from './selectionUtils';

// ============ 种子 PRNG (mulberry32) ============

/**
 * mulberry32 — 确定性的 32 位伪随机数生成器
 * 相同种子 → 相同序列，便于用户复现喜欢的消散效果
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============ 粒子类型 ============

export interface Particle {
  x: number;         // canvas 像素 X
  y: number;         // canvas 像素 Y
  color: string;     // hex 颜色
  vx: number;        // X 方向速度（像素/帧）
  vy: number;        // Y 方向速度（像素/帧）
  size: number;      // 粒子大小（像素）
  life: number;      // 当前生命值（帧）
  maxLife: number;   // 最大生命值（帧）
}

// ============ 消散参数 ============

export interface DissolveParams {
  angle: number;        // 主飞行方向角度（度），0=右，90=上，180=左，270=下
  intensity: number;    // 力度 0-100
  seed: number;         // 随机种子
  canvasWidth: number;  // 渲染 canvas 宽度
  canvasHeight: number; // 渲染 canvas 高度
}

/**
 * 根据选择的格子和图像数据生成粒子
 *
 * @param selectionKeys 选中的格子 key 集合 ("row,col")
 * @param pixelData 原始像素数据（用于取颜色 + 计算画布坐标）
 * @param gridDimensions 网格尺寸
 * @param previewCanvas 预览 canvas（用于计算格子像素位置和大小）
 * @param params 消散参数
 * @returns 粒子数组
 */
export function generateParticles(
  selectionKeys: Set<string>,
  pixelData: MappedPixel[][],
  gridDimensions: { N: number; M: number },
  previewCanvas: HTMLCanvasElement,
  params: DissolveParams
): Particle[] {
  const { N, M } = gridDimensions;
  const rng = createRng(params.seed);

  const canvasW = previewCanvas.width;
  const canvasH = previewCanvas.height;
  const cellW = canvasW / N;
  const cellH = canvasH / M;

  // 粒子数量：力度映射 1-8 个/格
  const particlesPerCell = Math.max(1, Math.round((params.intensity / 100) * 8));

  // 基础速度：力度映射 1-6 像素/帧
  const baseSpeed = 1 + (params.intensity / 100) * 5;

  // 角度转弧度
  const angleRad = (params.angle * Math.PI) / 180;
  const dirX = Math.cos(angleRad);
  const dirY = -Math.sin(angleRad); // canvas Y 轴向下，取反

  const particles: Particle[] = [];
  const maxLife = 60 + Math.floor(rng() * 30); // 60-90 帧 (约 1-1.5 秒 @60fps)

  for (const key of selectionKeys) {
    const { row, col } = parseCellKey(key);
    const cell = pixelData[row]?.[col];
    if (!cell || cell.isExternal) continue;

    const cellCenterX = (col + 0.5) * cellW;
    const cellCenterY = (row + 0.5) * cellH;

    for (let p = 0; p < particlesPerCell; p++) {
      // 在格子内随机散布起始位置
      const offsetX = (rng() - 0.5) * cellW;
      const offsetY = (rng() - 0.5) * cellH;

      // 速度：主方向 + 随机偏转 (±35°)
      const spreadAngle = (rng() - 0.5) * (Math.PI / 180) * 70;
      const finalAngle = Math.atan2(dirY, dirX) + spreadAngle;
      const speedVar = baseSpeed * (0.5 + rng() * 1.0);

      particles.push({
        x: cellCenterX + offsetX,
        y: cellCenterY + offsetY,
        color: cell.color,
        vx: Math.cos(finalAngle) * speedVar,
        vy: Math.sin(finalAngle) * speedVar,
        size: 2 + Math.floor(rng() * 3), // 2-4 px
        life: maxLife,
        maxLife,
      });
    }
  }

  return particles;
}

/**
 * 更新一帧粒子状态
 * @returns 存活的粒子数组
 */
export function updateParticles(particles: Particle[]): Particle[] {
  const alive: Particle[] = [];

  for (const p of particles) {
    const nextLife = p.life - 1;
    if (nextLife <= 0) continue;

    alive.push({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      // 轻微阻力减速
      vx: p.vx * 0.98,
      vy: p.vy * 0.98,
      life: nextLife,
    });
  }

  return alive;
}

/**
 * 渲染粒子到 canvas
 * @param ctx canvas 2D 上下文
 * @param particles 粒子数组
 */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
): void {
  for (const p of particles) {
    // 缓出淡出曲线：alpha = (life/maxLife)²
    const t = p.life / p.maxLife;
    const alpha = t * t;

    // 大小随生命衰减
    const size = p.size * t;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(
      p.x - size / 2,
      p.y - size / 2,
      Math.max(1, size),
      Math.max(1, size)
    );
  }
  ctx.globalAlpha = 1;
}
