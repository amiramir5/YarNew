import {
  MistakesAnalysis,
  QuizQuestion,
  SlideDeck,
  TopicExplanation,
} from '../types';
import { loadSettings } from './storage';

/**
 * Returns configured backend API base URL from VITE_API_BASE_URL
 */
export function getApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  return '';
}

/**
 * Validates endpoint URL and provides helpful error if running on GitHub Pages without backend
 */
function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base && typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    throw new Error(
      'سرور پشتیبان هوش مصنوعی برای این هاست گیت‌هاب پیجز هنوز پیکربندی نشده است. لطفاً متغیر VITE_API_BASE_URL را در مخزن گیت‌هاب روی آدرس سرور فعال (مانند Render یا Railway) تنظیم فرمایید.'
    );
  }
  return `${base}${path}`;
}

export async function explainTopic(
  topic: string,
  subject: string,
  customKey?: string,
  model?: string
): Promise<TopicExplanation> {
  const settings = loadSettings();
  const apiKey = customKey || settings.ai.geminiKey || undefined;
  const targetModel = model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/explain');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, subject, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در دریافت پاسخ از سرور (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok || !json.data) {
    throw new Error(json.error || 'پاسخ معتبری از مدل هوش مصنوعی دریافت نشد.');
  }

  return json.data as TopicExplanation;
}

export async function generateQuiz(
  subject: string,
  chapter: string,
  topic: string,
  level: string,
  count: number,
  sourceText?: string,
  model?: string
): Promise<QuizQuestion[]> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/quiz');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, chapter, topic, level, count, sourceText, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در ساخت سوالات تستی (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok || !json.data || !Array.isArray(json.data.questions)) {
    throw new Error(json.error || 'پاسخ معتبری برای آزمون دریافت نشد.');
  }

  return json.data.questions as QuizQuestion[];
}

export async function generateSlides(
  topicOrParams: string | { topic?: string; subject: string; grade?: string; chapter?: string; goftar?: string; count?: number; model?: string },
  subjectName?: string,
  slideCount?: number
): Promise<SlideDeck> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = settings.ai.geminiModel || undefined;

  let payload: any = {};
  if (typeof topicOrParams === 'object') {
    payload = { model: targetModel, ...topicOrParams, apiKey };
  } else {
    payload = {
      topic: topicOrParams,
      subject: subjectName || 'زیست‌شناسی',
      count: slideCount || 6,
      model: targetModel,
      apiKey,
    };
  }

  const url = buildApiUrl('/api/ai/slides');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در ساخت اسلایدهای آموزشی (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok || !json.data) {
    throw new Error(json.error || 'پاسخ معتبری برای اسلایدها دریافت نشد.');
  }

  return json.data as SlideDeck;
}

export async function analyzeMistakes(
  items: Array<{ subject: string; cause: string; question: string }>,
  model?: string
): Promise<MistakesAnalysis> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/mistakes-analysis');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در تحلیل شناختی دفترچه اشتباهات (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok || !json.data) {
    throw new Error(json.error || 'تحلیلی برای دفترچه اشتباهات بازگردانده نشد.');
  }

  return json.data as MistakesAnalysis;
}

export async function consultCoach(
  message: string,
  context: any,
  mode: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  model?: string
): Promise<string> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/coach');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, mode, history, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در ارتباط با مشاور هوشمند (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'پاسخی از مشاور هوشمند دریافت نشد.');
  }

  return (json.text || '') as string;
}

export async function extractOcrText(imageBase64: string, model?: string): Promise<string> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/ocr');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در خواندن تصویر (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'متنی از تصویر استخراج نشد.');
  }

  return (json.text || '') as string;
}

export interface PhotoSolveResult {
  transcribed_question: string;
  book_reference: string;
  correct_option: string;
  detailed_explanation: string;
  rejected_options?: Array<{ option: string; reason: string }>;
  traps_and_pitfalls?: string;
  study_tip?: string;
}

export async function solvePhotoQuestion(params: {
  imageBase64?: string;
  subject: string;
  chapter?: string;
  goftar?: string;
  customText?: string;
  model?: string;
}): Promise<PhotoSolveResult> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = params.model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/photo-solve');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در تحلیل سوال تصویری (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok || !json.data) {
    throw new Error(json.error || 'پاسخ تحلیلی برای سوال تصویری دریافت نشد.');
  }

  return json.data as PhotoSolveResult;
}

export async function getPerformanceInsights(metrics: {
  weekMinutes: number;
  totalMinutes: number;
  streak: number;
  testsCount: number;
  avgExamPercent: number | null;
  subjectMinutes: Record<string, number>;
}, model?: string): Promise<{
  status: string;
  strengths: string[];
  weaknesses: string[];
  actionItems: string[];
  summary: string;
}> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/performance-insights');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در دریافت تحلیل عملکرد (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok || !json.data) {
    throw new Error(json.error || 'داده‌ای برای تحلیل عملکرد دریافت نشد.');
  }

  return json.data;
}

export async function extractDocumentText(fileBase64: string, mimeType: string, model?: string): Promise<string> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;
  const targetModel = model || settings.ai.geminiModel || undefined;

  const url = buildApiUrl('/api/ai/extract-doc');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64, mimeType, apiKey, model: targetModel }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در خواندن فایل مدرک (کد ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'متنی از فایل استخراج نشد.');
  }

  return (json.text || '') as string;
}

export async function testAiConnection(
  provider: 'gemini' | 'openrouter',
  customKey?: string,
  model?: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === 'gemini') {
      const res = await explainTopic('سینتیک شیمیایی', 'شیمی', customKey, model);
      if (res && res.title) {
        return { ok: true, message: 'اتصال هوش مصنوعی Gemini تایید شد و پاسخ آزمایشی با موفقیت دریافت گردید.' };
      }
      return { ok: false, message: 'پاسخ دریافتی ناقص بود.' };
    } else {
      const settings = loadSettings();
      const openKey = customKey || settings.ai.openrouterKey;
      if (!openKey) {
        return { ok: false, message: 'لطفاً ابتدا کلید OpenRouter را وارد نمایید.' };
      }

      const url = buildApiUrl('/api/ai/test-openrouter');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: openKey,
          model: model || settings.ai.openrouterModel || 'openrouter/free',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        return { ok: false, message: json.error || 'خطا در احراز هویت OpenRouter' };
      }
      return { ok: true, message: json.message || 'اتصال OpenRouter تایید شد.' };
    }
  } catch (err: any) {
    return { ok: false, message: err.message || 'خطا در برقراری ارتباط با مدل هوش مصنوعی' };
  }
}
