/**
 * 图片去噪/锐化预处理工具。
 *
 * - boxBlur：卷积均值滤波（低通，去噪但画面变柔和）
 * - medianFilter：中值滤波（去椒盐噪点，保边缘不糊）
 * - unsharpMask：USM 锐化（原图 + (原图 - 模糊图) × 强度，增强清晰度）
 *
 * 边缘像素均按最近边界复制（clamp），输出尺寸与原图一致。
 */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 对整张图做均值滤波。
 * @param imageData 原图像素数据（RGBA）
 * @param radius 卷积半径（1 → 3×3，2 → 5×5，3 → 7×7）
 * @returns 滤波后的新 ImageData
 */
export function boxBlur(imageData: ImageData, radius: number): ImageData {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const tmp = new Float32Array(src.length);
  const out = new ImageData(w, h);
  const outData = out.data;
  const win = 2 * radius + 1;

  // 水平方向滑动窗口平均
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) {
        sum += src[row + clamp(x, 0, w - 1) * 4 + c];
      }
      for (let x = 0; x < w; x++) {
        tmp[row + x * 4 + c] = sum / win;
        sum +=
          src[row + clamp(x + radius + 1, 0, w - 1) * 4 + c] -
          src[row + clamp(x - radius, 0, w - 1) * 4 + c];
      }
    }
  }

  // 垂直方向滑动窗口平均
  for (let x = 0; x < w; x++) {
    const col = x * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) {
        sum += tmp[clamp(y, 0, h - 1) * w * 4 + col + c];
      }
      for (let y = 0; y < h; y++) {
        outData[y * w * 4 + col + c] = sum / win;
        sum +=
          tmp[clamp(y + radius + 1, 0, h - 1) * w * 4 + col + c] -
          tmp[clamp(y - radius, 0, h - 1) * w * 4 + col + c];
      }
    }
  }

  return out;
}

/**
 * 中值滤波：取窗口内像素值的中位数，能去掉椒盐噪点（孤立异色像素），
 * 且不会像均值滤波那样把边缘糊掉。
 * @param imageData 原图像素数据（RGBA）
 * @param radius 窗口半径（1 → 3×3，2 → 5×5）
 * @returns 滤波后的新 ImageData
 */
export function medianFilter(imageData: ImageData, radius: number): ImageData {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const out = new ImageData(w, h);
  const outData = out.data;
  const winSize = (2 * radius + 1) * (2 * radius + 1);
  const half = Math.floor(winSize / 2);
  const buf = new Array<number>(winSize);

  // 插入排序求中位数（窗口小，比快排开销低）
  const medianOf = (): number => {
    for (let i = 1; i < winSize; i++) {
      const v = buf[i];
      let j = i - 1;
      while (j >= 0 && buf[j] > v) {
        buf[j + 1] = buf[j];
        j--;
      }
      buf[j + 1] = v;
    }
    return buf[half];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // alpha 通道保持原样（图纸照片基本无透明）
      outData[(y * w + x) * 4 + 3] = src[(y * w + x) * 4 + 3];
      for (let c = 0; c < 3; c++) {
        let k = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = clamp(x + dx, 0, w - 1);
            buf[k++] = src[(yy * w + xx) * 4 + c];
          }
        }
        outData[(y * w + x) * 4 + c] = medianOf();
      }
    }
  }

  return out;
}

/**
 * USM 锐化（Unsharp Mask）：原图 + (原图 - 模糊图) × 强度。
 * 放大边缘对比，让画面更清晰。模糊半径决定锐化的尺度。
 * @param imageData 原图像素数据（RGBA）
 * @param radius 底层模糊半径（1 → 3×3 尺度）
 * @param strength 锐化强度（1 ~ 3，越大越锐）
 * @returns 锐化后的新 ImageData
 */
export function unsharpMask(imageData: ImageData, radius: number, strength: number): ImageData {
  const blurred = boxBlur(imageData, radius);
  const w = imageData.width;
  const h = imageData.height;
  const out = new ImageData(w, h);
  const src = imageData.data;
  const blurData = blurred.data;
  const outData = out.data;

  for (let i = 0; i < src.length; i++) {
    // alpha 不参与锐化
    if (i % 4 === 3) {
      outData[i] = src[i];
      continue;
    }
    const v = src[i] + (src[i] - blurData[i]) * strength;
    outData[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }

  return out;
}
