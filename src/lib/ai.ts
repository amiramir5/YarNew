import {
  MistakesAnalysis,
  QuizQuestion,
  SlideDeck,
  TopicExplanation,
} from '../types';
import { loadSettings } from './storage';

export async function explainTopic(
  topic: string,
  subject: string,
  customKey?: string
): Promise<TopicExplanation> {
  const settings = loadSettings();
  const apiKey = customKey || settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, subject, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در دریافت پاسخ از سرور (کد ${res.status})`);
  }

  const json = await res.json();
  return json.data as TopicExplanation;
}

export async function generateQuiz(
  subject: string,
  chapter: string,
  topic: string,
  level: string,
  count: number,
  sourceText?: string
): Promise<QuizQuestion[]> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, chapter, topic, level, count, sourceText, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در ساخت سوالات تستی (کد ${res.status})`);
  }

  const json = await res.json();
  return json.data.questions as QuizQuestion[];
}

export async function generateSlides(
  topicOrParams: string | { topic?: string; subject: string; grade?: string; chapter?: string; goftar?: string; count?: number },
  subjectName?: string,
  slideCount?: number
): Promise<SlideDeck> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  let payload: any = {};
  if (typeof topicOrParams === 'object') {
    payload = { ...topicOrParams, apiKey };
  } else {
    payload = {
      topic: topicOrParams,
      subject: subjectName || 'زیست‌شناسی',
      count: slideCount || 6,
      apiKey,
    };
  }

  const res = await fetch('/api/ai/slides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در ساخت اسلایدهای آموزشی (کد ${res.status})`);
  }

  const json = await res.json();
  return json.data as SlideDeck;
}

export async function analyzeMistakes(
  items: Array<{ subject: string; cause: string; question: string }>
): Promise<MistakesAnalysis> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/mistakes-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در تحلیل شناختی دفترچه اشتباهات (کد ${res.status})`);
  }

  const json = await res.json();
  return json.data as MistakesAnalysis;
}

export async function consultCoach(
  message: string,
  context: any,
  mode: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }>
): Promise<string> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, mode, history, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در ارتباط با مشاور هوشمند (کد ${res.status})`);
  }

  const json = await res.json();
  return json.text as string;
}

export async function extractOcrText(imageBase64: string): Promise<string> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در خواندن تصویر (کد ${res.status})`);
  }

  const json = await res.json();
  return json.text as string;
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
}): Promise<PhotoSolveResult> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/photo-solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در تحلیل سوال تصویری (کد ${res.status})`);
  }

  const json = await res.json();
  return json.data as PhotoSolveResult;
}

export async function getPerformanceInsights(metrics: {
  weekMinutes: number;
  totalMinutes: number;
  streak: number;
  testsCount: number;
  avgExamPercent: number | null;
  subjectMinutes: Record<string, number>;
}): Promise<{
  status: string;
  strengths: string[];
  weaknesses: string[];
  actionItems: string[];
  summary: string;
}> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/performance-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در دریافت تحلیل عملکرد (کد ${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function extractDocumentText(fileBase64: string, mimeType: string): Promise<string> {
  const settings = loadSettings();
  const apiKey = settings.ai.geminiKey || undefined;

  const res = await fetch('/api/ai/extract-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64, mimeType, apiKey }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `خطا در خواندن فایل مدرک (کد ${res.status})`);
  }

  const json = await res.json();
  return json.text as string;
}

export async function testAiConnection(
  provider: 'gemini' | 'openrouter',
  customKey?: string,
  model?: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === 'gemini') {
      const res = await explainTopic('سینتیک شیمیایی', 'شیمی', customKey);
      if (res && res.title) {
        return { ok: true, message: 'اتصال هوش مصنوعی Gemini Flash فعال و پرسرعت است.' };
      }
      return { ok: false, message: 'پاسخ نامعتبر دریافت شد.' };
    } else {
      const settings = loadSettings();
      const openKey = customKey || settings.ai.openrouterKey;
      if (!openKey) {
        return { ok: false, message: 'لطفاً ابتدا کلید OpenRouter را وارد نمایید.' };
      }

      const res = await fetch('/api/ai/test-openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: openKey,
          model: model || settings.ai.openrouterModel || 'meta-llama/llama-3.3-70b-instruct',
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        return { ok: false, message: json.error || 'خطا در احراز هویت OpenRouter' };
      }
      return { ok: true, message: json.message || 'اتصال OpenRouter تایید شد.' };
    }
  } catch (err: any) {
    return { ok: false, message: err.message || 'خطا در برقراری ارتباط با مدل هوش مصنوعی' };
  }
}
