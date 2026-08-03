// AI图片优化工具函数
import { ApiSettings } from './apiSettings';

export interface AIOptimizeOptions {
  customPrompt?: string;
  onProgress?: (progress: number) => void;
  settings: ApiSettings;
}

export interface AIOptimizeResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * 压缩图片到指定尺寸
 */
function resizeImage(img: HTMLImageElement, maxWidth: number = 2048, maxHeight: number = 2048): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let width = img.width;
  let height = img.height;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
}

function canvasToBase64(canvas: HTMLCanvasElement, maxSizeKB: number = 4096): string {
  let base64 = canvas.toDataURL('image/png');
  let sizeKB = Math.round((base64.length * 3) / 4 / 1024);

  if (sizeKB > maxSizeKB) {
    let quality = 0.9;
    while (sizeKB > maxSizeKB && quality > 0.3) {
      base64 = canvas.toDataURL('image/jpeg', quality);
      sizeKB = Math.round((base64.length * 3) / 4 / 1024);
      quality -= 0.1;
    }
  }

  if (sizeKB > maxSizeKB) {
    const scale = Math.sqrt(maxSizeKB / sizeKB) * 0.9;
    const newWidth = Math.floor(canvas.width * scale);
    const newHeight = Math.floor(canvas.height * scale);
    const newCanvas = document.createElement('canvas');
    newCanvas.width = newWidth;
    newCanvas.height = newHeight;
    const newCtx = newCanvas.getContext('2d');
    if (!newCtx) throw new Error('Failed to get canvas context');
    newCtx.imageSmoothingEnabled = true;
    newCtx.imageSmoothingQuality = 'high';
    newCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
    return canvasToBase64(newCanvas, maxSizeKB);
  }

  return base64;
}

export function imageToBase64(imageSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = resizeImage(img, 2048, 2048);
        const base64 = canvasToBase64(canvas, 4096);
        resolve(base64);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
}

// 豆包 Ark API（图生图）
async function optimizeViaDoubao(
  imageSrc: string,
  prompt: string,
  apiKey: string,
  baseUrl: string,
  onProgress?: (p: number) => void,
): Promise<AIOptimizeResult> {
  onProgress?.(10);
  const base64Image = await imageToBase64(imageSrc);
  onProgress?.(30);

  const payload = {
    model: 'doubao-seed-1.5-250715',
    prompt,
    image: base64Image,
    size: '1024x1024',
    response_format: 'url',
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  onProgress?.(80);

  const responseText = await response.text();
  if (!response.ok) {
    let errorMessage = responseText;
    try {
      const err = JSON.parse(responseText);
      errorMessage = err.message || err.error?.message || JSON.stringify(err);
    } catch {}
    throw new Error(`API 请求失败 (${response.status}): ${errorMessage}`);
  }

  const result = JSON.parse(responseText);
  onProgress?.(100);

  const imageUrl = result.data?.[0]?.url;
  if (imageUrl) {
    return { success: true, imageUrl };
  }
  return { success: false, error: `API 返回格式异常: ${responseText.slice(0, 200)}` };
}

// 调用自定义 API
async function optimizeViaCustom(
  imageSrc: string,
  prompt: string,
  settings: ApiSettings,
  onProgress?: (p: number) => void,
): Promise<AIOptimizeResult> {
  if (!settings.apiKey) {
    return { success: false, error: '请先配置 API Key。' };
  }
  if (!settings.baseUrl) {
    return { success: false, error: '请先配置 API 端点 URL。' };
  }

  onProgress?.(10);
  const base64Image = await imageToBase64(imageSrc);
  onProgress?.(30);

  const response = await fetch(settings.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      image: base64Image,
      prompt,
    }),
  });

  onProgress?.(80);

  const responseText = await response.text();
  if (!response.ok) {
    let errorMessage = responseText;
    try {
      const err = JSON.parse(responseText);
      errorMessage = err.message || err.error || `API request failed: ${response.status}`;
    } catch {}
    throw new Error(errorMessage);
  }

  const result = JSON.parse(responseText);
  onProgress?.(100);

  // 尝试多种常见的响应格式
  const imageUrl = result.image_url || result.imageUrl || result.data?.[0]?.url || result.data?.[0]?.image_url;
  if (imageUrl) {
    return { success: true, imageUrl };
  }
  return { success: false, error: 'API 返回格式无法解析，请确认端点 URL 正确。' };
}

export async function optimizeImageWithAI(
  imageSrc: string,
  options: AIOptimizeOptions,
): Promise<AIOptimizeResult> {
  const { customPrompt, onProgress, settings } = options;
  const prompt = customPrompt || settings.defaultPrompt;

  try {
    if (settings.provider === 'doubao') {
      if (!settings.apiKey) {
        return { success: false, error: '请先配置豆包 API Key（在 API 配置面板中填入）。' };
      }
      return await optimizeViaDoubao(imageSrc, prompt, settings.apiKey, settings.baseUrl, onProgress);
    } else {
      return await optimizeViaCustom(imageSrc, prompt, settings, onProgress);
    }
  } catch (error) {
    console.error('AI optimization error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI optimization failed',
    };
  }
}

export async function downloadImageAsDataURL(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to convert image to data URL'));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
