export interface ApiSettings {
  provider: 'doubao' | 'custom';
  apiKey: string;
  baseUrl: string;
  defaultPrompt: string;
}

const STORAGE_KEY = 'perler_ai_api_settings';

const DEFAULT_PROMPT = 'pixel art style, 16-bit, retro game aesthetic, sharp focus, high contrast, clean lines, detailed pixel art, masterpiece, best quality';

const DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

const DEFAULTS: ApiSettings = {
  provider: 'doubao',
  apiKey: '',
  baseUrl: DOUBAO_BASE_URL,
  defaultPrompt: DEFAULT_PROMPT,
};

export function loadApiSettings(): ApiSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveApiSettings(settings: Partial<ApiSettings>): void {
  if (typeof window === 'undefined') return;
  const current = loadApiSettings();
  const merged = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}
