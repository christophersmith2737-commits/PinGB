'use client';

/**
 * 逆向拼豆图纸识别 — 手动标定网格 + 自动逐格采样 + 色号映射
 *
 * 阶段流程：
 *   0: 绘制 X 轴（拖拽画线 + 输入格子数）
 *   1: 绘制 Y 轴（从 X 轴终点垂直拖拽 + 输入格子数）
 *   2: 调整网格（四方向扩展行/列）
 *   3: 预览确认（选择采样方式）
 *   4: 采样中（分批处理 + 进度条）
 *   5: 审视结果（原图/结果切换 + 格子改色）
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  AxisParams,
  CellGeometry,
  computeCellSize,
  generateGridGeometry,
  xAxisDirection,
  ExtendDirection,
  sampleCenterPoint,
  sampleFivePoints,
  sampleNinePoints,
} from '../utils/reverseRecognition';
import {
  MappedPixel,
  PaletteColor,
  RgbColor,
  hexToRgb,
  rgbDistance,
  findClosestPaletteColorByRgbDistance,
} from '../utils/pixelation';
import {
  ColorSystem,
  getColorKeyByHex,
} from '../utils/colorSystemUtils';

export interface ReverseRecognitionResult {
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  colorCounts: { [key: string]: { count: number; color: string } };
  totalBeadCount: number;
}

interface ReverseRecognitionModalProps {
  imageSrc: string;
  isOpen: boolean;
  palette: PaletteColor[];
  selectedColorSystem: ColorSystem;
  onClose: () => void;
  onConfirm: (result: ReverseRecognitionResult) => void;
}

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

interface Point {
  x: number;
  y: number;
}

interface GridBounds {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
}

const PHASE_TITLES: Record<Phase, string> = {
  0: '第 1 步：绘制 X 轴',
  1: '第 2 步：绘制 Y 轴',
  2: '第 3 步：调整网格',
  3: '第 4 步：确认采样',
  4: '正在采样…',
  5: '审视识别结果',
};

export default function ReverseRecognitionModal({
  imageSrc,
  isOpen,
  palette,
  selectedColorSystem,
  onClose,
  onConfirm,
}: ReverseRecognitionModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [phase, setPhase] = useState<Phase>(0);
  const [xAxis, setXAxis] = useState<AxisParams | null>(null);
  // 第一下点击放置的 X 起点（未画完 X 轴时）
  const [xStartPoint, setXStartPoint] = useState<Point | null>(null);
  // 起点是否已用 Enter 锁定（锁定后 WSAD 不再微调起点）
  const [xStartLocked, setXStartLocked] = useState(false);
  // 光标在图片中的位置（用于预览线）
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [xCountInput, setXCountInput] = useState<string>('40');
  const [xCount, setXCount] = useState<number>(0);
  // 点击放置的 Y 终点（从 X 轴终点出发，被约束到垂直方向）
  const [yEndPoint, setYEndPoint] = useState<Point | null>(null);
  const [ySign, setYSign] = useState<1 | -1>(1); // 1 = 与 baseYDir 同向（默认屏幕向上）, -1 = 反向
  const [yCountInput, setYCountInput] = useState<string>('40');
  const [yCount, setYCount] = useState<number>(0);
  const [bounds, setBounds] = useState<GridBounds>({ colStart: 0, colEnd: 0, rowStart: 0, rowEnd: 0 });
  const [samplingMethod, setSamplingMethod] = useState<'center' | 'five' | 'nine'>('center');
  const [progress, setProgress] = useState(0);
  const [mappedData, setMappedData] = useState<MappedPixel[][] | null>(null);
  // 调试：每个格子的原始采样 RGB（映射前的颜色）
  const [sampledRgb, setSampledRgb] = useState<(RgbColor | null)[][] | null>(null);
  const [viewMode, setViewMode] = useState<'original' | 'result'>('original');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [customColorInput, setCustomColorInput] = useState<string>('#FF0000');
  // 放大镜：光标位置（图片坐标 + 屏幕坐标）
  const [magnifier, setMagnifier] = useState<{
    imgX: number; imgY: number; clientX: number; clientY: number;
  } | null>(null);

  const MAG_SIZE = 160; // 放大镜显示尺寸 px
  const MAG_ZOOM = 6;   // 放大倍率

  // ── 打开时重置 ──
  useEffect(() => {
    if (isOpen) {
      setPhase(0);
      setXAxis(null);
      setXStartPoint(null);
      setXStartLocked(false);
      setHoverPoint(null);
      setXCountInput('40');
      setXCount(0);
      setYEndPoint(null);
      setYSign(1);
      setYCountInput('40');
      setYCount(0);
      setBounds({ colStart: 0, colEnd: 0, rowStart: 0, rowEnd: 0 });
      setProgress(0);
      setMappedData(null);
      setSampledRgb(null);
      setViewMode('original');
      setSelectedCell(null);
    }
  }, [isOpen]);

  // ── 加载图片 ──
  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    setImg(null);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
      }
    };
    image.src = imageSrc;
  }, [isOpen, imageSrc]);

  // ── 坐标换算：client → 图片坐标 ──
  const clientToImage = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  // ── Y 轴方向（垂直约束） ──
  const xDir = xAxis ? xAxisDirection(xAxis) : { dx: 1, dy: 0 };
  // 屏幕向上的垂直方向：对水平 X 轴即向上
  const baseYDir = { dx: xDir.dy, dy: -xDir.dx };
  const yDir = { dx: baseYDir.dx * ySign, dy: baseYDir.dy * ySign };
  const cellSize = xAxis ? computeCellSize(xAxis) : 1;
  // X 轴是否大致水平（决定 WSAD 微调时哪个键对生效）
  const horizontalXAxis = Math.abs(xDir.dx) >= Math.abs(xDir.dy);

  // ── 当前网格几何 ──
  // Y 轴 = X 终点到用户点击位置的线段，单格高度 = 该长度 / 格子数（允许矩形格）
  const geometries: CellGeometry[] = useMemo(() => {
    if (!xAxis || yCount <= 0 || !yEndPoint) return [];
    return generateGridGeometry(
      xAxis,
      yCount,
      bounds.colStart,
      bounds.colEnd,
      bounds.rowStart,
      bounds.rowEnd,
      yEndPoint.x,
      yEndPoint.y,
    );
  }, [xAxis, yCount, bounds, yEndPoint]);

  const N = bounds.colEnd - bounds.colStart;
  const M = bounds.rowEnd - bounds.rowStart;

  // ── 画布重绘 ──
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !img) return;

    // 自愈：canvas 元素可能因条件渲染重建（如 Phase 5 切换视图），恢复图片原始尺寸
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // 画 X 轴
    const drawAxisLine = (
      x1: number, y1: number, x2: number, y2: number,
      color: string, width: number, dash: number[] = [],
    ) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    };

    const drawEndpoint = (x: number, y: number, color: string) => {
      ctx.save();
      ctx.globalAlpha = 0.7;
      // 小外圈
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      // 中心点
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    if (xAxis) {
      drawAxisLine(xAxis.startX, xAxis.startY, xAxis.endX, xAxis.endY, '#EF4444', 3);
      drawEndpoint(xAxis.startX, xAxis.startY, '#EF4444');
      drawEndpoint(xAxis.endX, xAxis.endY, '#EF4444');
    } else if (xStartPoint) {
      // 已放置起点：画起点 + 吸附预览实线
      drawEndpoint(xStartPoint.x, xStartPoint.y, '#EF4444');
      if (hoverPoint) {
        const dx = hoverPoint.x - xStartPoint.x;
        const dy = hoverPoint.y - xStartPoint.y;
        let px = hoverPoint.x;
        let py = hoverPoint.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          py = xStartPoint.y; // 水平吸附
        } else {
          px = xStartPoint.x; // 垂直吸附
        }
        drawAxisLine(xStartPoint.x, xStartPoint.y, px, py, '#EF4444', 2);
      }
    }

    // 画 Y 轴（垂直方向）：X 终点 → 用户放置的终点，与网格完全一致
    if (xAxis && phase >= 1) {
      if (yEndPoint) {
        drawAxisLine(xAxis.endX, xAxis.endY, yEndPoint.x, yEndPoint.y, '#3B82F6', 3);
        drawEndpoint(yEndPoint.x, yEndPoint.y, '#3B82F6');
      } else if (hoverPoint) {
        // 光标悬停：垂直实线预览（从 X 终点投影）
        const vx = hoverPoint.x - xAxis.endX;
        const vy = hoverPoint.y - xAxis.endY;
        const proj = vx * baseYDir.dx + vy * baseYDir.dy;
        const len = Math.abs(proj);
        if (len > 1) {
          const side = proj >= 0 ? 1 : -1;
          const previewDir = { dx: baseYDir.dx * side, dy: baseYDir.dy * side };
          drawAxisLine(
            xAxis.endX, xAxis.endY,
            xAxis.endX + len * previewDir.dx, xAxis.endY + len * previewDir.dy,
            '#3B82F6', 2,
          );
        }
      }
    }

    // 画网格
    if (xAxis && yCount > 0 && phase >= 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.lineWidth = 1;
      for (const g of geometries) {
        const xDirV = { dx: xDir.dx, dy: xDir.dy };
        const yDirV = { dx: yDir.dx, dy: yDir.dy };
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x + g.w * xDirV.dx, g.y + g.w * xDirV.dy);
        ctx.lineTo(g.x + g.w * xDirV.dx + g.h * yDirV.dx, g.y + g.w * xDirV.dy + g.h * yDirV.dy);
        ctx.lineTo(g.x + g.h * yDirV.dx, g.y + g.h * yDirV.dy);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, phase, xAxis, xStartPoint, hoverPoint, yEndPoint, yCount, ySign, geometries]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // ── 结果画布 ──
  const redrawResult = useCallback(() => {
    const canvas = resultCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !mappedData) return;

    const cellDisplay = Math.max(8, Math.min(28, Math.floor(760 / Math.max(N, M))));
    canvas.width = N * cellDisplay;
    canvas.height = M * cellDisplay;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isDarkMode = document.documentElement.classList.contains('dark');
    for (let r = 0; r < M; r++) {
      for (let c = 0; c < N; c++) {
        const cell = mappedData[r]?.[c];
        const x = c * cellDisplay;
        const y = r * cellDisplay;
        if (cell && !cell.isExternal) {
          ctx.fillStyle = cell.color;
        } else {
          ctx.fillStyle = isDarkMode ? '#374151' : '#F3F4F6';
        }
        ctx.fillRect(x, y, cellDisplay, cellDisplay);

        // 色号标签（格子够大才显示）
        if (cellDisplay >= 14 && cell && !cell.isExternal) {
          const key = getColorKeyByHex(cell.color.toUpperCase(), selectedColorSystem);
          // 根据颜色亮度选择文字颜色
          const rgb = hexToRgb(cell.color);
          const luminance = rgb ? (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) : 255;
          ctx.fillStyle = luminance > 150 ? '#111827' : '#FFFFFF';
          ctx.font = `${Math.max(7, cellDisplay * 0.4)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(key, x + cellDisplay / 2, y + cellDisplay / 2);
        }

        // 选中格子高亮
        if (selectedCell && selectedCell.row === r && selectedCell.col === c) {
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cellDisplay - 2, cellDisplay - 2);
        }
      }
    }
  }, [mappedData, N, M, selectedColorSystem, selectedCell]);

  useEffect(() => {
    if (phase === 5) redrawResult();
  }, [phase, redrawResult]);

  // ── 放大镜绘制 ──
  const drawMagnifier = useCallback(() => {
    const magCanvas = magnifierCanvasRef.current;
    const srcCanvas = canvasRef.current;
    if (!magCanvas || !srcCanvas || !magnifier) return;
    const ctx = magCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (magCanvas.width !== MAG_SIZE * dpr || magCanvas.height !== MAG_SIZE * dpr) {
      magCanvas.width = MAG_SIZE * dpr;
      magCanvas.height = MAG_SIZE * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 源区域（图片坐标）：以光标为中心 MAG_SIZE/MAG_ZOOM 见方
    const srcSize = MAG_SIZE / MAG_ZOOM;
    const sx = magnifier.imgX - srcSize / 2;
    const sy = magnifier.imgY - srcSize / 2;

    // 圆形裁剪
    ctx.save();
    ctx.beginPath();
    ctx.arc(MAG_SIZE / 2, MAG_SIZE / 2, MAG_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#1F2937';
    ctx.fillRect(0, 0, MAG_SIZE, MAG_SIZE);
    ctx.imageSmoothingEnabled = false; // 保持像素锐利
    ctx.drawImage(srcCanvas, sx, sy, srcSize, srcSize, 0, 0, MAG_SIZE, MAG_SIZE);
    ctx.restore();

    // 中心点标记（与放置点样式一致：小圆点 + 70% 不透明度）
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(MAG_SIZE / 2, MAG_SIZE / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [magnifier]);

  useEffect(() => {
    drawMagnifier();
  }, [drawMagnifier, img]);

  // 放大镜屏幕位置（贴近光标，自动翻转避免出屏）
  const magnifierStyle = useMemo(() => {
    if (!magnifier) return null;
    const left =
      magnifier.clientX + 24 + MAG_SIZE > window.innerWidth
        ? magnifier.clientX - 24 - MAG_SIZE
        : magnifier.clientX + 24;
    const top =
      magnifier.clientY + 24 + MAG_SIZE > window.innerHeight
        ? magnifier.clientY - 24 - MAG_SIZE
        : magnifier.clientY + 24;
    return { left, top };
  }, [magnifier]);

  // ── 画布鼠标事件 ──
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = clientToImage(e.clientX, e.clientY);
    if (phase === 0) {
      if (!xAxis) {
        if (!xStartPoint) {
          // 第一下：直接放置起点
          setXStartPoint({ x: pos.x, y: pos.y });
        } else {
          // 第二下：放置终点（强制水平/垂直吸附）
          const dx = pos.x - xStartPoint.x;
          const dy = pos.y - xStartPoint.y;
          let endX = pos.x;
          let endY = pos.y;
          if (Math.abs(dx) >= Math.abs(dy)) {
            endY = xStartPoint.y; // 水平吸附
          } else {
            endX = xStartPoint.x; // 垂直吸附
          }
          const len = Math.hypot(endX - xStartPoint.x, endY - xStartPoint.y);
          if (len < 10) return; // 太短，忽略本次点击
          setXAxis({
            startX: xStartPoint.x,
            startY: xStartPoint.y,
            endX,
            endY,
            count: 0, // 待用户输入
          });
          setXStartPoint(null);
        }
      }
    } else if (phase === 1 && xAxis) {
      // 点击放置 Y 终点（投影到垂直方向）
      const vx = pos.x - xAxis.endX;
      const vy = pos.y - xAxis.endY;
      const proj = vx * baseYDir.dx + vy * baseYDir.dy;
      const len = Math.abs(proj);
      if (len < Math.max(1, cellSize * 0.5)) return; // 太短，忽略
      setYSign(proj >= 0 ? 1 : -1);
      const suggested = Math.max(1, Math.round(len / cellSize));
      setYCountInput(String(suggested));
      setYEndPoint({
        x: xAxis.endX + proj * baseYDir.dx,
        y: xAxis.endY + proj * baseYDir.dy,
      });
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = clientToImage(e.clientX, e.clientY);
    // 放大镜跟随（Phase 0/1 选点阶段）
    if (phase === 0 || phase === 1) {
      setMagnifier({ imgX: pos.x, imgY: pos.y, clientX: e.clientX, clientY: e.clientY });
      setHoverPoint({ x: pos.x, y: pos.y });
    }
  };

  const handleCanvasPointerLeave = () => {
    setMagnifier(null);
    setHoverPoint(null);
  };

  // ── 确认 X 轴 ──
  const handleConfirmXAxis = useCallback(() => {
    if (!xAxis) return;
    const n = parseInt(xCountInput, 10);
    if (isNaN(n) || n < 2 || n > 500) {
      alert('请输入 2-500 之间的格子数量');
      return;
    }
    setXCount(n);
    setXAxis({ ...xAxis, count: n });
    setPhase(1);
  }, [xAxis, xCountInput]);

  // ── 确认 Y 轴 ──
  const handleConfirmYAxis = useCallback(() => {
    const m = parseInt(yCountInput, 10);
    if (isNaN(m) || m < 2 || m > 500) {
      alert('请输入 2-500 之间的格子数量');
      return;
    }
    setYCount(m);
    setBounds({ colStart: 0, colEnd: xCount, rowStart: 0, rowEnd: m });
    setPhase(2);
  }, [yCountInput, xCount]);

  // ── 键盘微调：WSAD 以 1 像素步长移动当前点，Enter 确定 ──
  // 第 1 个点（X 起点）：四方向自由移动
  // 第 2 个点（X 终点）：锁定在 X 轴上（水平轴 → A/D 左右；垂直轴 → W/S 上下）
  // 第 3 个点（Y 终点）：锁定在 Y 轴上（X 水平 → W/S 上下；X 垂直 → A/D 左右）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isTyping =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
      const key = e.key.toLowerCase();

      if (key === 'enter') {
        if (e.repeat) return;
        if (tag === 'BUTTON') return; // 焦点在按钮上时交给按钮自身的 Enter 行为
        if (phase === 0) {
          if (!xAxis && xStartPoint && !xStartLocked) {
            // 第 1 个点确定 → 锁定起点，等待放置终点
            e.preventDefault();
            setXStartLocked(true);
          } else if (xAxis) {
            // 第 2 个点确定 → 确认 X 轴，进入 Y 轴阶段
            e.preventDefault();
            handleConfirmXAxis();
          }
        } else if (phase === 1 && yEndPoint) {
          // 第 3 个点确定 → 确认 Y 轴
          e.preventDefault();
          handleConfirmYAxis();
        }
        return;
      }

      if (key !== 'w' && key !== 'a' && key !== 's' && key !== 'd') return;
      if (isTyping) return; // 输入框内正常打字，不拦截
      if (!img) return;

      const step = e.shiftKey ? 10 : 1; // Shift 加速
      const clampX = (v: number) => Math.max(0, Math.min(img.naturalWidth - 1, v));
      const clampY = (v: number) => Math.max(0, Math.min(img.naturalHeight - 1, v));
      e.preventDefault();

      if (phase === 0) {
        if (!xAxis && xStartPoint && !xStartLocked) {
          // 第 1 个点：四方向自由微调
          setXStartPoint(p => {
            if (!p) return p;
            const x = clampX(p.x + (key === 'a' ? -step : key === 'd' ? step : 0));
            const y = clampY(p.y + (key === 'w' ? -step : key === 's' ? step : 0));
            return { x, y };
          });
        } else if (xAxis) {
          // 第 2 个点：锁定在 X 轴上（垂直方向键无效）
          const axisKey = horizontalXAxis
            ? key === 'a' || key === 'd'
            : key === 'w' || key === 's';
          if (!axisKey) return;
          setXAxis(prev => {
            if (!prev) return prev;
            const next = { ...prev };
            if (horizontalXAxis) {
              next.endX = clampX(next.endX + (key === 'a' ? -step : step));
            } else {
              next.endY = clampY(next.endY + (key === 'w' ? -step : step));
            }
            return next;
          });
        }
      } else if (phase === 1 && yEndPoint) {
        // 第 3 个点：锁定在 Y 轴上（沿 X 轴方向的键无效）
        const axisKey = horizontalXAxis
          ? key === 'w' || key === 's'
          : key === 'a' || key === 'd';
        if (!axisKey) return;
        setYEndPoint(p => {
          if (!p) return p;
          const next = { ...p };
          if (horizontalXAxis) {
            next.y = clampY(next.y + (key === 'w' ? -step : step));
          } else {
            next.x = clampX(next.x + (key === 'a' ? -step : step));
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, xAxis, xStartPoint, xStartLocked, yEndPoint, horizontalXAxis, img, handleConfirmXAxis, handleConfirmYAxis]);

  // ── 网格扩展（按屏幕方向判断，适配 X 轴左右朝向和 Y 轴上下朝向） ──
  const handleExtend = (direction: ExtendDirection) => {
    const xRight = xDir.dx >= 0; // X 轴是否指向屏幕右方
    const yUp = yDir.dy < 0;     // Y 轴是否指向屏幕上方
    setBounds(prev => {
      switch (direction) {
        case 'up':
          return yUp ? { ...prev, rowEnd: prev.rowEnd + 1 } : { ...prev, rowStart: prev.rowStart - 1 };
        case 'down':
          return yUp ? { ...prev, rowStart: prev.rowStart - 1 } : { ...prev, rowEnd: prev.rowEnd + 1 };
        case 'left':
          return xRight ? { ...prev, colStart: prev.colStart - 1 } : { ...prev, colEnd: prev.colEnd + 1 };
        case 'right':
          return xRight ? { ...prev, colEnd: prev.colEnd + 1 } : { ...prev, colStart: prev.colStart - 1 };
      }
    });
  };

  // ── 开始采样 ──
  const startSampling = () => {
    if (!img || !xAxis) return;
    setPhase(4);
    setProgress(0);

    // 一次性读取完整图片像素
    const offCanvas = document.createElement('canvas');
    offCanvas.width = img.naturalWidth;
    offCanvas.height = img.naturalHeight;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;
    offCtx.drawImage(img, 0, 0);
    const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);

    const grid: (MappedPixel | null)[][] = Array.from({ length: M }, () =>
      Array.from({ length: N }, () => null),
    );
    // 调试：记录每个格子的原始采样 RGB
    const rawRgbGrid: (RgbColor | null)[][] = Array.from({ length: M }, () =>
      Array.from({ length: N }, () => null),
    );
    // 正式匹配：原始采样 RGB → 色库所有颜色计算 RGB 三维欧氏距离 → 取最小者（返回 hex）
    const mapRgbToPalette = (rgb: RgbColor): string | null => {
      const best = findClosestPaletteColorByRgbDistance(rgb, palette);
      return best ? best.hex : null;
    };

    // 多采样点加权投票：每个点先各自映射成色号再计票（中心 centerWeight 票，其余各 2 票）。
    // 结果必为某个采样点映射出的色号，绝不做 RGB 平均后重新匹配。
    // 投票按采样顺序计数，平局时靠前的点（中心）优先。
    const voteBySamples = (samples: (RgbColor | null)[], centerWeight: number): string | null => {
      const votes = new Map<string, number>();
      samples.forEach((rgb, i) => {
        if (!rgb) return;
        const hex = mapRgbToPalette(rgb);
        if (hex) {
          const weight = i === 0 ? centerWeight : 2;
          votes.set(hex, (votes.get(hex) || 0) + weight);
        }
      });
      let bestKey: string | null = null;
      let bestCount = -1;
      for (const [hex, count] of votes) {
        if (count > bestCount) {
          bestCount = count;
          bestKey = hex;
        }
      }
      return bestKey;
    };

    // 行索引换算：app 约定 mappedData[0] = 最上一行（屏幕上方）
    // Y 轴向上时图片 row 越大越靠上 → 翻转；Y 轴向下时直接平移
    const yUp = yDir.dy < 0;
    const imageRowToDisplayRow = (imageRow: number) =>
      yUp ? bounds.rowEnd - 1 - imageRow : imageRow - bounds.rowStart;

    let idx = 0;
    const total = geometries.length;

    const step = () => {
      const endIdx = Math.min(idx + 200, total);
      for (; idx < endIdx; idx++) {
        const g = geometries[idx];
        const displayRow = imageRowToDisplayRow(g.row);
        const displayCol = g.col - bounds.colStart;

        if (samplingMethod === 'five' || samplingMethod === 'nine') {
          // 五点/九点采样：每个点分别映射色号 → 加权投票
          // 五点：中心 3 票 + 上下左右各 2 票 = 11 票
          // 九点：中心 5 票 + 8 方向各 2 票 = 21 票
          // 投票按采样顺序计数（中心在前），平局时中心优先
          const samples =
            samplingMethod === 'nine'
              ? sampleNinePoints(imageData, g)
              : sampleFivePoints(imageData, g);
          rawRgbGrid[displayRow][displayCol] = samples[0]; // 调试记录中心点原始色
          const bestKey = voteBySamples(samples, samplingMethod === 'nine' ? 5 : 3);
          if (bestKey) {
            grid[displayRow][displayCol] = {
              key: bestKey,
              color: bestKey,
              isExternal: false,
            };
          }
        } else {
          // 中心点采样
          const rgb = sampleCenterPoint(imageData, g);
          if (rgb) {
            rawRgbGrid[displayRow][displayCol] = rgb;
            const hex = mapRgbToPalette(rgb);
            if (hex) {
              grid[displayRow][displayCol] = {
                key: hex,
                color: hex,
                isExternal: false,
              };
            }
          }
        }
      }
      setProgress(idx / total);
      if (idx < total) {
        requestAnimationFrame(step);
      } else {
        // 未采样到的格子标记为透明
        for (let r = 0; r < M; r++) {
          for (let c = 0; c < N; c++) {
            if (!grid[r][c]) {
              grid[r][c] = { key: 'ERASE', color: '#FFFFFF', isExternal: true };
            }
          }
        }
        setMappedData(grid as MappedPixel[][]);
        setSampledRgb(rawRgbGrid);
        setPhase(5);
        setViewMode('result');
      }
    };
    requestAnimationFrame(step);
  };

  // ── 结果格子修改 ──
  const applyCellColor = (row: number, col: number, hex: string) => {
    setMappedData(prev => {
      if (!prev) return prev;
      const next = prev.map(r => r.map(cell => ({ ...cell })));
      const upper = hex.toUpperCase();
      next[row][col] = { key: upper, color: upper, isExternal: false };
      return next;
    });
  };

  // 当前网格中出现过的颜色（用于快速选择）
  const gridUniqueColors = useMemo(() => {
    if (!mappedData) return [];
    const seen = new Map<string, string>();
    mappedData.flat().forEach(cell => {
      if (cell && !cell.isExternal) {
        seen.set(cell.color.toUpperCase(), cell.color.toUpperCase());
      }
    });
    return Array.from(seen.values()).slice(0, 48);
  }, [mappedData]);

  // ── 导入 PinGB ──
  const handleImport = () => {
    if (!mappedData) return;
    const counts: { [key: string]: { count: number; color: string } } = {};
    let total = 0;
    mappedData.flat().forEach(cell => {
      if (cell && !cell.isExternal) {
        const h = cell.color.toUpperCase();
        if (!counts[h]) counts[h] = { count: 0, color: h };
        counts[h].count++;
        total++;
      }
    });
    onConfirm({
      mappedPixelData: mappedData,
      gridDimensions: { N, M },
      colorCounts: counts,
      totalBeadCount: total,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* 实时放大镜 */}
      {magnifier && (phase === 0 || phase === 1) && magnifierStyle && (
        <div
          className="pointer-events-none fixed z-[60]"
          style={{ left: magnifierStyle.left, top: magnifierStyle.top }}
        >
          <canvas
            ref={magnifierCanvasRef}
            style={{
              width: MAG_SIZE,
              height: MAG_SIZE,
              borderRadius: '50%',
              border: '2px solid #FFFFFF',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            逆向图纸识别
            <span className="ml-3 text-sm font-normal text-gray-500 dark:text-gray-400">
              {PHASE_TITLES[phase]}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 画布区 */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          {phase !== 5 ? (
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full cursor-crosshair"
              style={{ maxHeight: '55vh' }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerLeave={handleCanvasPointerLeave}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 w-full">
              {/* 切换按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('original')}
                  className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                    viewMode === 'original'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  原图 + 网格
                </button>
                <button
                  onClick={() => setViewMode('result')}
                  className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                    viewMode === 'result'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  识别结果
                </button>
              </div>

              {viewMode === 'original' ? (
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-full"
                  style={{ maxHeight: '50vh' }}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerLeave={handleCanvasPointerLeave}
                />
              ) : (
                <canvas
                  ref={resultCanvasRef}
                  className="max-w-full max-h-full border border-gray-300 dark:border-gray-600"
                  style={{ maxHeight: '50vh', imageRendering: 'pixelated' }}
                  onClick={e => {
                    const canvas = resultCanvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const cellDisplay = canvas.width / N;
                    const col = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width / cellDisplay);
                    const row = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height / cellDisplay);
                    if (row >= 0 && row < M && col >= 0 && col < N) {
                      setSelectedCell(prev =>
                        prev && prev.row === row && prev.col === col ? null : { row, col },
                      );
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* 控制栏 */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {/* Phase 0: X 轴输入 */}
          {phase === 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {xAxis
                  ? '已画好 X 轴，请输入这条线段包含的格子数：'
                  : xStartPoint
                    ? xStartLocked
                      ? '起点已确定，请点击第二个位置放置终点（自动吸附水平/垂直）'
                      : '起点已放置 — WSAD 微调 1 像素（Shift 加速），Enter 确定起点'
                    : '点击图片放置 X 轴起点，线段会自动吸附为水平或垂直'}
              </span>
              {xAxis && (
                <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                  {horizontalXAxis ? 'A/D' : 'W/S'} 微调终点 · Enter 确定
                </span>
              )}
              {xStartPoint && (
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                  {xAxis
                    ? `终点 (${Math.round(xAxis.endX)}, ${Math.round(xAxis.endY)})`
                    : `起点 (${Math.round(xStartPoint.x)}, ${Math.round(xStartPoint.y)})`}
                </span>
              )}
              {xAxis && (
                <>
                  <input
                    type="number"
                    value={xCountInput}
                    onChange={e => setXCountInput(e.target.value)}
                    min={2}
                    max={500}
                    className="w-24 p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                  />
                  <button
                    onClick={handleConfirmXAxis}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-md transition-colors"
                  >
                    确定 X 轴
                  </button>
                  <button
                    onClick={() => { setXAxis(null); setXStartPoint(null); }}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    重画
                  </button>
                </>
              )}
              {!xAxis && xStartPoint && (
                <button
                  onClick={() => { setXStartPoint(null); setXStartLocked(false); }}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  取消起点
                </button>
              )}
            </div>
          )}

          {/* Phase 1: Y 轴输入 */}
          {phase === 1 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {yEndPoint
                  ? '已放置 Y 轴终点，请输入 Y 方向格子数：'
                  : '点击图片放置 Y 轴终点（自动强制垂直于 X 轴）'}
              </span>
              {yEndPoint && (
                <>
                  <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                    {horizontalXAxis ? 'W/S' : 'A/D'} 微调终点 · Enter 确定
                  </span>
                  <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                    终点 ({Math.round(yEndPoint.x)}, {Math.round(yEndPoint.y)})
                  </span>
                </>
              )}
              {yEndPoint && (
                <>
                  <input
                    type="number"
                    value={yCountInput}
                    onChange={e => setYCountInput(e.target.value)}
                    min={2}
                    max={500}
                    className="w-24 p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                  />
                  <button
                    onClick={handleConfirmYAxis}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-md transition-colors"
                  >
                    确定 Y 轴
                  </button>
                  <button
                    onClick={() => setYEndPoint(null)}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    重新放置
                  </button>
                </>
              )}
            </div>
          )}

          {/* Phase 2: 网格调整 */}
          {phase === 2 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => handleExtend('up')}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  ⬆ 增加上方行
                </button>
                <button
                  onClick={() => handleExtend('left')}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  ⬅ 增加左侧列
                </button>
                <div className="px-4 py-1.5 text-sm font-mono bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md text-blue-800 dark:text-blue-200">
                  当前 {N} 列 × {M} 行
                </div>
                <button
                  onClick={() => handleExtend('right')}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  增加右侧列 ➡
                </button>
                <button
                  onClick={() => handleExtend('down')}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  ⬇ 增加下方行
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => setPhase(3)}
                  className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-md transition-colors shadow-sm"
                >
                  确认采样区域
                </button>
              </div>
            </div>
          )}

          {/* Phase 3: 采样方式确认 */}
          {phase === 3 && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-300">采样方式：</span>
              <button
                onClick={() => setSamplingMethod('center')}
                className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                  samplingMethod === 'center'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                }`}
              >
                中心点采样（默认）
              </button>
              <button
                onClick={() => setSamplingMethod('five')}
                className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                  samplingMethod === 'five'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                }`}
              >
                五点投票采样（高精度）
              </button>
              <button
                onClick={() => setSamplingMethod('nine')}
                className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                  samplingMethod === 'nine'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                }`}
              >
                九点投票采样（最高精度）
              </button>
              <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                {N} 列 × {M} 行
              </span>
              <button
                onClick={() => setPhase(2)}
                className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                返回调整
              </button>
              <button
                onClick={startSampling}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-md transition-colors shadow-sm"
              >
                确认并开始采样
              </button>
            </div>
          )}

          {/* Phase 4: 采样进度 */}
          {phase === 4 && (
            <div className="flex flex-col gap-2">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-100"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <div className="text-center text-sm text-gray-600 dark:text-gray-300">
                正在采样 {Math.round(progress * 100)}%（
                {samplingMethod === 'nine' ? '九点投票' : samplingMethod === 'five' ? '五点投票' : '中心点'}采样）
              </div>
            </div>
          )}

          {/* Phase 5: 审视结果 */}
          {phase === 5 && (
            <div className="flex flex-col gap-2">
              {/* 调试信息：原图采样色 / 识别色号 / 色号实际色 */}
              {selectedCell && mappedData && (
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs font-mono bg-gray-100 dark:bg-gray-900 rounded-md px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-300">
                    第 {selectedCell.row + 1} 行第 {selectedCell.col + 1} 列
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">
                    原图采样颜色:{' '}
                    {sampledRgb?.[selectedCell.row]?.[selectedCell.col]
                      ? (() => {
                          const rgb = sampledRgb[selectedCell.row][selectedCell.col]!;
                          return `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`;
                        })()
                      : '无（透明）'}
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">
                    识别出来的色号:{' '}
                    {(() => {
                      const cell = mappedData[selectedCell.row]?.[selectedCell.col];
                      return cell && !cell.isExternal
                        ? getColorKeyByHex(cell.color.toUpperCase(), selectedColorSystem)
                        : '无';
                    })()}
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">
                    {(() => {
                      const cell = mappedData[selectedCell.row]?.[selectedCell.col];
                      if (!cell || cell.isExternal) return '实际颜色: 无';
                      const key = getColorKeyByHex(cell.color.toUpperCase(), selectedColorSystem);
                      const rgb = hexToRgb(cell.color);
                      return rgb
                        ? `${key}实际颜色: RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`
                        : `${key}实际颜色: 未知`;
                    })()}
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">
                    RGB 三维欧氏距离:{' '}
                    {(() => {
                      const rgb = sampledRgb?.[selectedCell.row]?.[selectedCell.col];
                      const cell = mappedData[selectedCell.row]?.[selectedCell.col];
                      if (!rgb || !cell || cell.isExternal) return '无';
                      const actual = hexToRgb(cell.color);
                      return actual ? rgbDistance(rgb, actual).toFixed(2) : '未知';
                    })()}
                  </span>
                </div>
              )}

              {/* 格子编辑栏 */}
              <div className="flex flex-wrap items-center gap-2 justify-center">
                {selectedCell && mappedData ? (
                  <>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      修改为：
                    </span>
                    <span
                      className="inline-block w-5 h-5 rounded-sm border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: mappedData[selectedCell.row]?.[selectedCell.col]?.color }}
                    />
                    <span className="text-sm font-mono text-gray-700 dark:text-gray-200">
                      {mappedData[selectedCell.row]?.[selectedCell.col]
                        ? getColorKeyByHex(
                            mappedData[selectedCell.row][selectedCell.col].color.toUpperCase(),
                            selectedColorSystem,
                          )
                        : '?'}
                    </span>
                    <div className="flex flex-wrap items-center gap-1 max-w-xl overflow-x-auto">
                      {gridUniqueColors.map(hex => (
                        <button
                          key={hex}
                          onClick={() => applyCellColor(selectedCell.row, selectedCell.col, hex)}
                          className="w-6 h-6 rounded-sm border border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform flex-shrink-0"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={customColorInput}
                        onChange={e => setCustomColorInput(e.target.value)}
                        className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                      />
                      <button
                        onClick={() => applyCellColor(selectedCell.row, selectedCell.col, customColorInput)}
                        className="px-2 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md"
                      >
                        应用
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    点击结果图中的格子可修改颜色
                  </span>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setPhase(2)}
                  className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  返回调整
                </button>
                <button
                  onClick={handleImport}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-md transition-colors shadow-sm"
                >
                  确认并导入 PinGB
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
