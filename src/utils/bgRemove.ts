/**
 * 智能抠图 — remove.bg API
 * 每月 50 张免费额度
 */

export interface BgRemoveResult {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

export async function removeBackground(
  imageSrc: string,
  apiKey?: string,
  onProgress?: (pct: number) => void
): Promise<BgRemoveResult> {
  onProgress?.(10);
  const response = await fetch('/api/bg-remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: imageSrc, apiKey }),
  });
  onProgress?.(80);

  const text = await response.text();
  let data: BgRemoveResult;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`服务端错误: ${text.substring(0, 200)}`);
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  onProgress?.(100);
  return data;
}
